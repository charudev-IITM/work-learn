#!/bin/bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$SCRIPT_DIR/k8s"
DOMAIN_NAME=""
EMAIL=""
REGISTRY=""

# Function to show usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  -d, --domain DOMAIN     Domain name for the application"
    echo "  -e, --email EMAIL       Email for Let's Encrypt certificates"
    echo "  -r, --registry REGISTRY Container registry (e.g., docker.io/username)"
    echo "  --dry-run              Show what would be deployed without applying"
    echo "  -h, --help             Show this help message"
    exit 1
}

# Parse command line arguments
DRY_RUN=false
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--domain)
            DOMAIN_NAME="$2"
            shift 2
            ;;
        -e|--email)
            EMAIL="$2"
            shift 2
            ;;
        -r|--registry)
            REGISTRY="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            print_error "Unknown option: $1"
            usage
            ;;
    esac
done

# Validate required parameters
if [[ -z "$DOMAIN_NAME" ]]; then
    print_error "Domain name is required"
    usage
fi

if [[ -z "$EMAIL" ]]; then
    print_error "Email is required for SSL certificate generation"
    usage
fi

if [[ -z "$REGISTRY" ]]; then
    print_error "Container registry is required"
    usage
fi

print_status "Starting Kubernetes deployment for domain: $DOMAIN_NAME"

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    print_error "kubectl is not installed or not in PATH"
    exit 1
fi

# Check if we can connect to the cluster
if ! kubectl cluster-info &> /dev/null; then
    print_error "Cannot connect to Kubernetes cluster"
    print_warning "Make sure kubectl is configured and you have access to the cluster"
    exit 1
fi

# Check if cluster has required resources
print_status "Checking cluster capabilities..."

# Check for nginx ingress controller
if ! kubectl get ingressclass nginx &> /dev/null; then
    print_warning "Nginx ingress controller not found. Installing..."
    if [[ "$DRY_RUN" == false ]]; then
        kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.1/deploy/static/provider/cloud/deploy.yaml
        print_status "Waiting for ingress controller to be ready..."
        kubectl wait --namespace ingress-nginx --for=condition=ready pod --selector=app.kubernetes.io/component=controller --timeout=300s
    else
        print_status "[DRY RUN] Would install nginx ingress controller"
    fi
fi

# Check for cert-manager
if ! kubectl get crd certificates.cert-manager.io &> /dev/null; then
    print_warning "cert-manager not found. Installing..."
    if [[ "$DRY_RUN" == false ]]; then
        kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
        print_status "Waiting for cert-manager to be ready..."
        kubectl wait --namespace cert-manager --for=condition=ready pod --selector=app=cert-manager --timeout=300s
    else
        print_status "[DRY RUN] Would install cert-manager"
    fi
fi

# Create temporary directory for processed manifests
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

print_status "Processing Kubernetes manifests..."

# Copy and process manifests
cp -r "$K8S_DIR"/* "$TEMP_DIR/"

# Replace domain placeholders
find "$TEMP_DIR" -type f -name "*.yaml" -exec sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN_NAME/g" {} \;

# Generate secure passwords and update secrets
print_status "Generating secure passwords..."
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
JWT_SECRET=$(openssl rand -base64 64 | tr -d "=+/" | cut -c1-50)
API_SECRET_KEY=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)

# Update secrets file
sed -i "s/REPLACE_WITH_SECURE_PASSWORD/$POSTGRES_PASSWORD/g" "$TEMP_DIR/secrets.yaml"
sed -i "s/REPLACE_WITH_JWT_SECRET/$JWT_SECRET/g" "$TEMP_DIR/secrets.yaml"
sed -i "s/REPLACE_WITH_API_SECRET/$API_SECRET_KEY/g" "$TEMP_DIR/secrets.yaml"
sed -i "s/REPLACE_WITH_REDIS_PASSWORD/$REDIS_PASSWORD/g" "$TEMP_DIR/secrets.yaml"

# Build and push Docker images
print_status "Building and pushing Docker images..."
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

if [[ "$DRY_RUN" == false ]]; then
    # Build backend image
    print_status "Building backend image..."
    docker build -f "$PROJECT_ROOT/docker/Dockerfile.backend" -t "$REGISTRY/comp-intel-backend:latest" "$PROJECT_ROOT"
    docker push "$REGISTRY/comp-intel-backend:latest"
    
    # Build frontend image
    print_status "Building frontend image..."
    docker build -f "$PROJECT_ROOT/docker/Dockerfile.frontend" -t "$REGISTRY/comp-intel-frontend:latest" "$PROJECT_ROOT" \
        --build-arg VITE_API_URL="https://$DOMAIN_NAME/api" \
        --build-arg VITE_WS_URL="wss://$DOMAIN_NAME/ws" \
        --build-arg VITE_TURNSTILE_SITE_KEY="0x4AAAAAACqABnmr8Cq7v3LD"
    docker push "$REGISTRY/comp-intel-frontend:latest"
    
    print_success "Docker images built and pushed successfully"
else
    print_status "[DRY RUN] Would build and push Docker images to $REGISTRY"
fi

# Update image references in manifests
sed -i "s|comp-intel/backend:latest|$REGISTRY/comp-intel-backend:latest|g" "$TEMP_DIR/backend.yaml"
sed -i "s|comp-intel/frontend:latest|$REGISTRY/comp-intel-frontend:latest|g" "$TEMP_DIR/frontend.yaml"

# Create cert-manager ClusterIssuer
print_status "Creating cert-manager ClusterIssuer..."
cat > "$TEMP_DIR/cluster-issuer.yaml" << EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: $EMAIL
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF

# Apply manifests in order
MANIFESTS=(
    "namespace.yaml"
    "cluster-issuer.yaml"
    "secrets.yaml"
    "storage.yaml"
    "postgres.yaml"
    "redis.yaml"
    "backend.yaml"
    "frontend.yaml"
    "ingress.yaml"
    "hpa.yaml"
)

if [[ "$DRY_RUN" == true ]]; then
    print_status "DRY RUN - Would apply the following manifests:"
    for manifest in "${MANIFESTS[@]}"; do
        echo "  - $manifest"
    done
    
    print_status "Manifest contents preview:"
    for manifest in "${MANIFESTS[@]}"; do
        echo "=== $manifest ==="
        head -20 "$TEMP_DIR/$manifest"
        echo ""
    done
    exit 0
fi

print_status "Applying Kubernetes manifests..."

for manifest in "${MANIFESTS[@]}"; do
    print_status "Applying $manifest..."
    kubectl apply -f "$TEMP_DIR/$manifest"
done

# Wait for deployments to be ready
print_status "Waiting for deployments to be ready..."

DEPLOYMENTS=("postgres" "redis" "backend" "frontend")
for deployment in "${DEPLOYMENTS[@]}"; do
    print_status "Waiting for $deployment deployment..."
    kubectl rollout status deployment/$deployment -n comp-intel --timeout=600s
done

# Check if ingress is ready
print_status "Checking ingress status..."
sleep 30

EXTERNAL_IP=""
for i in {1..30}; do
    EXTERNAL_IP=$(kubectl get ingress comp-intel-ingress -n comp-intel -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
    if [[ -n "$EXTERNAL_IP" ]]; then
        break
    fi
    print_status "Waiting for ingress external IP... ($i/30)"
    sleep 10
done

# Final health checks
print_status "Performing final health checks..."

# Check pod status
kubectl get pods -n comp-intel

# Test API endpoint
if [[ -n "$EXTERNAL_IP" ]]; then
    print_success "External IP assigned: $EXTERNAL_IP"
    print_warning "Please update your DNS records to point $DOMAIN_NAME to $EXTERNAL_IP"
    
    # Wait a bit for DNS propagation (if testing locally)
    sleep 10
    
    # Test health endpoint
    if curl -sSf "http://$EXTERNAL_IP/health" > /dev/null 2>&1; then
        print_success "Health check passed"
    else
        print_warning "Health check failed - this may be due to DNS not being configured yet"
    fi
else
    print_warning "External IP not assigned yet. Check ingress controller status."
fi

# Show deployment summary
print_success "Kubernetes deployment completed!"
echo ""
echo "=== Deployment Summary ==="
echo "Namespace: comp-intel"
echo "Domain: https://$DOMAIN_NAME"
echo "External IP: ${EXTERNAL_IP:-'Pending'}"
echo ""
echo "=== Services Deployed ==="
echo "- Frontend (React): 2 replicas"
echo "- Backend (FastAPI): 2 replicas"
echo "- PostgreSQL: 1 replica"
echo "- Redis: 1 replica"
echo ""
echo "=== DNS Configuration Required ==="
if [[ -n "$EXTERNAL_IP" ]]; then
    echo "Add this A record to your DNS:"
    echo "$DOMAIN_NAME IN A $EXTERNAL_IP"
else
    echo "Waiting for external IP assignment..."
    echo "Run: kubectl get ingress comp-intel-ingress -n comp-intel"
fi
echo ""
echo "=== Management Commands ==="
echo "View pods: kubectl get pods -n comp-intel"
echo "View services: kubectl get svc -n comp-intel"
echo "View ingress: kubectl get ingress -n comp-intel"
echo "View logs: kubectl logs -f deployment/backend -n comp-intel"
echo "Scale backend: kubectl scale deployment backend --replicas=5 -n comp-intel"
echo "Update deployment: kubectl rollout restart deployment/backend -n comp-intel"
echo ""
echo "=== Monitoring ==="
echo "Watch pods: kubectl get pods -n comp-intel -w"
echo "Describe pod: kubectl describe pod <pod-name> -n comp-intel"
echo "Get events: kubectl get events -n comp-intel --sort-by=.metadata.creationTimestamp"
echo ""

# Save important information
cat > "$SCRIPT_DIR/deployment-info.txt" << EOF
Deployment Information
=====================
Date: $(date)
Domain: $DOMAIN_NAME
External IP: ${EXTERNAL_IP:-'Pending'}
Registry: $REGISTRY

Credentials (SAVE THESE SECURELY):
- Postgres Password: $POSTGRES_PASSWORD
- JWT Secret: $JWT_SECRET
- API Secret Key: $API_SECRET_KEY
- Redis Password: $REDIS_PASSWORD

Management Commands:
- kubectl get pods -n comp-intel
- kubectl logs -f deployment/backend -n comp-intel
- kubectl get ingress -n comp-intel
EOF

print_success "Deployment information saved to deployment-info.txt"
print_warning "Please save the credentials from deployment-info.txt securely!"

if [[ -n "$EXTERNAL_IP" ]]; then
    echo ""
    print_status "Testing endpoint availability..."
    echo "Once DNS is configured, your application will be available at:"
    echo "🌐 https://$DOMAIN_NAME"
    echo "📊 API Docs: https://$DOMAIN_NAME/docs"
    echo "💓 Health Check: https://$DOMAIN_NAME/health"
fi