#!/bin/bash
set -euo pipefail

# =============================================================================
# K3s 2-Node Cluster Setup for Competitive Intelligence Platform
# =============================================================================
# Architecture:
#   node-1 (server): K3s server + data workloads (postgres, redis, scrapers)
#   node-2 (agent):  K3s agent + app workloads (backend, frontend, traefik)
#
# Prerequisites:
#   - 2x DigitalOcean droplets (s-2vcpu-4gb) in BLR1
#   - SSH access to both nodes
#   - Domain nameservers pointed to Cloudflare
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }

# ---------------------------------------------------------------------------
# Configuration — edit these before running
# ---------------------------------------------------------------------------
NODE1_IP="${NODE1_IP:-}"          # K3s server (data node)
NODE2_IP="${NODE2_IP:-}"          # K3s agent (app node)
DOMAIN="${DOMAIN:-}"             # e.g. spotcompare.com
DO_TOKEN="${DO_TOKEN:-}"         # DigitalOcean API token (for CSI driver)
REGISTRY_NAME="${REGISTRY_NAME:-comp-intel}"  # DO Container Registry name
SSH_KEY="${SSH_KEY:-~/.ssh/id_rsa}"

usage() {
    echo "Usage: $0 [step]"
    echo ""
    echo "Environment variables required:"
    echo "  NODE1_IP      - IP of K3s server node (data)"
    echo "  NODE2_IP      - IP of K3s agent node (app)"
    echo "  DOMAIN        - Domain name (e.g. spotcompare.com)"
    echo "  DO_TOKEN      - DigitalOcean API token"
    echo ""
    echo "Steps (run in order, or run without args for all):"
    echo "  1-server      Install K3s server on node-1"
    echo "  2-agent       Install K3s agent on node-2"
    echo "  3-csi         Install DO CSI driver for block storage"
    echo "  4-registry    Configure DO Container Registry access"
    echo "  5-origin-ca   Generate and install Cloudflare Origin CA cert"
    echo "  6-verify      Verify cluster is ready"
    exit 1
}

validate_env() {
    local missing=0
    for var in NODE1_IP NODE2_IP DOMAIN DO_TOKEN; do
        if [[ -z "${!var}" ]]; then
            error "Missing required env var: $var"
            missing=1
        fi
    done
    [[ $missing -eq 1 ]] && usage
}

ssh_cmd() {
    local ip=$1; shift
    ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -i "$SSH_KEY" "root@$ip" "$@"
}

# ---------------------------------------------------------------------------
# Step 1: Install K3s Server on node-1
# ---------------------------------------------------------------------------
step_server() {
    info "Installing K3s server on node-1 ($NODE1_IP)..."

    ssh_cmd "$NODE1_IP" bash <<'REMOTE'
set -euo pipefail

# Install K3s server with node label
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server \
  --node-label node-role=data \
  --write-kubeconfig-mode 644 \
  --tls-san $(hostname -I | awk '{print $1}') \
  --disable servicelb" sh -

# Wait for K3s to be ready
echo "Waiting for K3s server..."
for i in $(seq 1 30); do
    if kubectl get nodes &>/dev/null; then
        echo "K3s server is ready"
        break
    fi
    sleep 2
done

# Install Docker (needed for building images on the server)
if ! command -v docker &>/dev/null; then
    echo "Installing Docker for image builds..."
    curl -fsSL https://get.docker.com | sh
fi

# Get node token for agent join
cat /var/lib/rancher/k3s/server/node-token
REMOTE

    # Fetch kubeconfig
    info "Fetching kubeconfig..."
    mkdir -p ~/.kube
    scp -o StrictHostKeyChecking=no -i "$SSH_KEY" "root@$NODE1_IP:/etc/rancher/k3s/k3s.yaml" ~/.kube/k3s-config
    sed -i.bak "s/127.0.0.1/$NODE1_IP/g" ~/.kube/k3s-config
    rm -f ~/.kube/k3s-config.bak

    export KUBECONFIG=~/.kube/k3s-config
    success "K3s server installed. KUBECONFIG saved to ~/.kube/k3s-config"

    # Fetch the node token
    NODE_TOKEN=$(ssh_cmd "$NODE1_IP" "cat /var/lib/rancher/k3s/server/node-token")
    echo ""
    info "Node token for agent join:"
    echo "$NODE_TOKEN"
    echo ""
    echo "Export for next step:"
    echo "  export K3S_TOKEN='$NODE_TOKEN'"
}

# ---------------------------------------------------------------------------
# Step 2: Install K3s Agent on node-2
# ---------------------------------------------------------------------------
step_agent() {
    local K3S_TOKEN="${K3S_TOKEN:-}"
    if [[ -z "$K3S_TOKEN" ]]; then
        # Try to fetch from server
        K3S_TOKEN=$(ssh_cmd "$NODE1_IP" "cat /var/lib/rancher/k3s/server/node-token" 2>/dev/null || true)
        if [[ -z "$K3S_TOKEN" ]]; then
            error "K3S_TOKEN not set. Run step 1 first or export K3S_TOKEN"
            exit 1
        fi
    fi

    info "Installing K3s agent on node-2 ($NODE2_IP)..."

    ssh_cmd "$NODE2_IP" bash <<REMOTE
set -euo pipefail

curl -sfL https://get.k3s.io | K3S_URL="https://$NODE1_IP:6443" \
  K3S_TOKEN="$K3S_TOKEN" \
  INSTALL_K3S_EXEC="agent --node-label node-role=app" sh -

echo "K3s agent installed"
REMOTE

    # Verify agent joined
    export KUBECONFIG=~/.kube/k3s-config
    info "Waiting for agent to join cluster..."
    for i in $(seq 1 30); do
        if kubectl get nodes 2>/dev/null | grep -q "Ready.*Ready"; then
            success "Agent node joined cluster"
            kubectl get nodes -o wide
            break
        fi
        sleep 3
    done
}

# ---------------------------------------------------------------------------
# Step 3: Install DigitalOcean CSI Driver
# ---------------------------------------------------------------------------
step_csi() {
    export KUBECONFIG=~/.kube/k3s-config

    info "Installing DigitalOcean CSI driver..."

    # Create DO API token secret
    kubectl create secret generic digitalocean \
        --from-literal=access-token="$DO_TOKEN" \
        -n kube-system \
        --dry-run=client -o yaml | kubectl apply -f -

    # Install CSI driver
    kubectl apply -f https://raw.githubusercontent.com/digitalocean/csi-digitalocean/master/deploy/kubernetes/releases/csi-digitalocean-v4.9.0/crds.yaml
    kubectl apply -f https://raw.githubusercontent.com/digitalocean/csi-digitalocean/master/deploy/kubernetes/releases/csi-digitalocean-v4.9.0/driver.yaml
    kubectl apply -f https://raw.githubusercontent.com/digitalocean/csi-digitalocean/master/deploy/kubernetes/releases/csi-digitalocean-v4.9.0/snapshot-controller.yaml

    # Verify CSI driver pods
    info "Waiting for CSI driver pods..."
    sleep 10
    kubectl get pods -n kube-system | grep csi || warn "CSI pods not ready yet, may take a minute"

    success "DO CSI driver installed"

    # Patch Traefik to use hostPort (servicelb is disabled) and pin to app node
    # Traefik must run on the app node (node-2) where Cloudflare DNS A record points
    info "Patching Traefik for hostPort (80/443) + nodeSelector (app node)..."
    kubectl patch deployment traefik -n kube-system --type='json' -p='[
      {"op":"replace","path":"/spec/template/spec/containers/0/ports/2","value":{"containerPort":8000,"hostPort":80,"name":"web","protocol":"TCP"}},
      {"op":"replace","path":"/spec/template/spec/containers/0/ports/3","value":{"containerPort":8443,"hostPort":443,"name":"websecure","protocol":"TCP"}},
      {"op":"add","path":"/spec/template/spec/nodeSelector","value":{"node-role":"app"}}
    ]'
    success "Traefik hostPort + nodeSelector patch applied"
}

# ---------------------------------------------------------------------------
# Step 4: Configure DO Container Registry
# ---------------------------------------------------------------------------
step_registry() {
    export KUBECONFIG=~/.kube/k3s-config

    info "Configuring DO Container Registry access..."

    # Install doctl if not present
    if ! command -v doctl &>/dev/null; then
        warn "doctl not installed. Install it: https://docs.digitalocean.com/reference/doctl/how-to/install/"
        warn "Then run: doctl auth init --access-token \$DO_TOKEN"
        warn "Then run: doctl registry kubernetes-manifest | kubectl apply -f -"
        return
    fi

    # Auth doctl
    doctl auth init --access-token "$DO_TOKEN" 2>/dev/null || true

    # Create registry if it doesn't exist
    doctl registry create "$REGISTRY_NAME" --region blr1 2>/dev/null || info "Registry may already exist"

    # Generate and apply registry credentials to cluster
    doctl registry kubernetes-manifest --namespace comp-intel | kubectl apply -f -

    # Also apply to default namespace for init containers
    doctl registry kubernetes-manifest | kubectl apply -f -

    success "Registry credentials configured"
    info "Registry URL: registry.digitalocean.com/$REGISTRY_NAME"
}

# ---------------------------------------------------------------------------
# Step 5: Cloudflare Origin CA Certificate
# ---------------------------------------------------------------------------
step_origin_ca() {
    export KUBECONFIG=~/.kube/k3s-config

    info "Setting up Cloudflare Origin CA certificate..."
    echo ""
    echo "============================================================"
    echo "  Manual step: Generate Origin CA certificate in Cloudflare"
    echo "============================================================"
    echo ""
    echo "1. Go to Cloudflare Dashboard > $DOMAIN > SSL/TLS > Origin Server"
    echo "2. Click 'Create Certificate'"
    echo "3. Settings:"
    echo "   - Key type: RSA (2048)"
    echo "   - Hostnames: $DOMAIN, *.$DOMAIN"
    echo "   - Validity: 15 years"
    echo "4. Save the certificate as 'origin-cert.pem'"
    echo "5. Save the private key as 'origin-key.pem'"
    echo ""

    read -rp "Have you saved the cert and key files? (y/n): " confirm
    if [[ "$confirm" != "y" ]]; then
        warn "Skipping Origin CA setup. Run this step again when ready."
        return
    fi

    read -rp "Path to origin-cert.pem: " CERT_PATH
    read -rp "Path to origin-key.pem: " KEY_PATH

    if [[ ! -f "$CERT_PATH" || ! -f "$KEY_PATH" ]]; then
        error "Certificate files not found"
        exit 1
    fi

    # Create namespace first if it doesn't exist
    kubectl apply -f "$(dirname "$0")/00-namespace.yaml"

    # Create TLS secret
    kubectl create secret tls origin-ca-tls \
        --cert="$CERT_PATH" \
        --key="$KEY_PATH" \
        -n comp-intel \
        --dry-run=client -o yaml | kubectl apply -f -

    success "Origin CA TLS secret created"

    echo ""
    echo "============================================================"
    echo "  Cloudflare DNS Configuration"
    echo "============================================================"
    echo ""
    echo "1. Set SSL/TLS mode to 'Full (Strict)'"
    echo "2. Add A record: $DOMAIN -> $NODE2_IP (Proxied/Orange cloud)"
    echo "3. Enable WebSocket support (should be on by default)"
    echo "4. Cache Rules:"
    echo "   - $DOMAIN/assets/* -> Cache Everything, Edge TTL 1 year"
    echo "   - $DOMAIN/api/*    -> Bypass Cache"
    echo "   - $DOMAIN/ws/*     -> Bypass Cache"
    echo "   - $DOMAIN/health   -> Bypass Cache"
    echo ""
}

# ---------------------------------------------------------------------------
# Step 6: Verify Cluster
# ---------------------------------------------------------------------------
step_verify() {
    export KUBECONFIG=~/.kube/k3s-config

    info "Verifying cluster state..."
    echo ""

    echo "=== Nodes ==="
    kubectl get nodes -o wide
    echo ""

    echo "=== Node Labels ==="
    kubectl get nodes --show-labels | grep -oP 'node-role=\w+'
    echo ""

    echo "=== System Pods ==="
    kubectl get pods -n kube-system
    echo ""

    echo "=== Storage Classes ==="
    kubectl get storageclass
    echo ""

    # Check node resources
    echo "=== Node Resources ==="
    kubectl top nodes 2>/dev/null || warn "Metrics server may not be ready yet"
    echo ""

    # Verify labels
    local data_nodes=$(kubectl get nodes -l node-role=data --no-headers 2>/dev/null | wc -l)
    local app_nodes=$(kubectl get nodes -l node-role=app --no-headers 2>/dev/null | wc -l)

    if [[ $data_nodes -ge 1 && $app_nodes -ge 1 ]]; then
        success "Cluster is ready! Data nodes: $data_nodes, App nodes: $app_nodes"
    else
        error "Missing node labels. Data: $data_nodes, App: $app_nodes"
        warn "Expected at least 1 data node and 1 app node"
    fi

    echo ""
    echo "Next: Run deploy.sh to deploy the application"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
validate_env

case "${1:-all}" in
    1-server)   step_server ;;
    2-agent)    step_agent ;;
    3-csi)      step_csi ;;
    4-registry) step_registry ;;
    5-origin-ca) step_origin_ca ;;
    6-verify)   step_verify ;;
    all)
        step_server
        step_agent
        step_csi
        step_registry
        step_origin_ca
        step_verify
        ;;
    *)
        usage
        ;;
esac
