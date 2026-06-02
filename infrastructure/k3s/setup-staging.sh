#!/bin/bash
set -euo pipefail

# =============================================================================
# Setup Staging Environment in K3s
# =============================================================================
# Creates the comp-intel-staging namespace and bootstraps all staging services.
#
# Prerequisites:
#   - K3s cluster setup complete (setup-cluster.sh)
#   - Production namespace deployed (deploy.sh)
#   - Cloudflare Origin CA cert covers *.spotcompare.com (wildcard)
#
# Usage:
#   ./setup-staging.sh
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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAGING_DIR="$SCRIPT_DIR/staging"
NAMESPACE="comp-intel-staging"
KUBECONFIG="${KUBECONFIG:-$HOME/.kube/k3s-config}"
REGISTRY="${REGISTRY:-registry.digitalocean.com/comp-intel}"
DOMAIN="${DOMAIN:-spotcompare.com}"

export KUBECONFIG

# ---------------------------------------------------------------------------
# Step 1: Create staging namespace
# ---------------------------------------------------------------------------
info "Step 1: Creating staging namespace..."
kubectl apply -f "$STAGING_DIR/00-namespace.yaml"
success "Namespace $NAMESPACE created"

# ---------------------------------------------------------------------------
# Step 2: Copy Origin CA TLS secret from production namespace
# ---------------------------------------------------------------------------
info "Step 2: Copying Origin CA TLS secret to staging namespace..."

# Check if the secret exists in production
if kubectl get secret origin-ca-tls -n comp-intel &>/dev/null; then
    kubectl get secret origin-ca-tls -n comp-intel -o json \
        | jq 'del(.metadata.namespace, .metadata.resourceVersion, .metadata.uid, .metadata.creationTimestamp)' \
        | jq ".metadata.namespace = \"$NAMESPACE\"" \
        | kubectl apply -f -
    success "TLS secret copied to staging"
else
    warn "Origin CA TLS secret not found in production namespace."
    warn "Staging HTTPS will not work until the secret is created."
    warn "Ensure your Cloudflare Origin CA cert covers *.${DOMAIN}"
fi

# ---------------------------------------------------------------------------
# Step 3: Create staging secrets (prompt or use defaults)
# ---------------------------------------------------------------------------
info "Step 3: Applying staging secrets..."

# Copy production secrets as base (shares external services: Turnstile, MSG91, Groq, etc.)
# Only override DB-specific values (staging has its own PostgreSQL)
if kubectl get secret app-secrets -n comp-intel &>/dev/null; then
    info "  Copying production secrets as base..."
    kubectl get secret app-secrets -n comp-intel -o json \
        | jq 'del(.metadata.resourceVersion, .metadata.uid, .metadata.creationTimestamp, .metadata.managedFields)' \
        | jq ".metadata.namespace = \"$NAMESPACE\"" \
        | kubectl apply -f -
else
    error "Production secrets not found. Deploy production first."
    exit 1
fi

# Override staging-specific values (separate DB, separate JWT signing)
STAGING_PG_PASS=$(openssl rand -base64 16 2>/dev/null || echo "staging_pg_pass_$(date +%s)")
STAGING_JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "staging_jwt_$(date +%s)")

kubectl patch secret app-secrets -n "$NAMESPACE" --type='json' -p="[
    {\"op\":\"replace\",\"path\":\"/data/POSTGRES_PASSWORD\",\"value\":\"$(echo -n "$STAGING_PG_PASS" | base64)\"},
    {\"op\":\"replace\",\"path\":\"/data/JWT_SECRET\",\"value\":\"$(echo -n "$STAGING_JWT_SECRET" | base64)\"}
]"

info "  Staging PG password and JWT secret overridden"

# Update PgBouncer userlist with the staging PG password
# PgBouncer needs SCRAM-SHA-256 hash — get it from postgres after it starts
# For now, apply configmap with placeholder; Step 5 will fix PgBouncer auth
kubectl apply -f "$STAGING_DIR/02-configmap.yaml"

success "Staging secrets and configs applied"

# ---------------------------------------------------------------------------
# Step 4: Apply staging manifests
# ---------------------------------------------------------------------------
info "Step 4: Applying staging manifests..."

# Get latest image tag from production
IMAGE_TAG=$(kubectl get deployment backend -n comp-intel -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null | rev | cut -d: -f1 | rev || echo "latest")
info "  Using image tag: $IMAGE_TAG"

for f in "$STAGING_DIR"/{03,04,05,06,07}-*.yaml; do
    if [[ -f "$f" ]]; then
        info "  Applying $(basename "$f")..."
        sed \
            -e "s|REGISTRY_PLACEHOLDER|$REGISTRY|g" \
            -e "s|IMAGE_TAG|$IMAGE_TAG|g" \
            -e "s|DOMAIN_PLACEHOLDER|$DOMAIN|g" \
            "$f" | kubectl apply -f -
    fi
done

success "All staging manifests applied"

# ---------------------------------------------------------------------------
# Step 5: Wait for pods to be ready
# ---------------------------------------------------------------------------
info "Step 5: Waiting for staging pods..."

kubectl rollout status deployment/postgres -n "$NAMESPACE" --timeout=120s
kubectl rollout status deployment/pgbouncer -n "$NAMESPACE" --timeout=60s
kubectl rollout status deployment/backend -n "$NAMESPACE" --timeout=180s
kubectl rollout status deployment/frontend -n "$NAMESPACE" --timeout=120s

success "All staging pods ready"

# ---------------------------------------------------------------------------
# Step 6: Verify
# ---------------------------------------------------------------------------
info "Step 6: Verifying staging environment..."
echo ""

echo "=== Staging Pods ==="
kubectl get pods -n "$NAMESPACE" -o wide
echo ""

echo "=== Staging Services ==="
kubectl get svc -n "$NAMESPACE"
echo ""

echo "=== Staging Ingress ==="
kubectl get ingress -n "$NAMESPACE"
echo ""

# Verify cross-namespace Redis connectivity
info "Verifying cross-namespace Redis access..."
kubectl exec deploy/backend -n "$NAMESPACE" -- python -c "
import redis, os
r = redis.Redis.from_url(os.getenv('REDIS_URL', 'redis://redis.comp-intel.svc.cluster.local:6379'))
print(f'Redis ping: {r.ping()}')
keys = r.keys('rates:*')
print(f'Rate keys found: {len(keys)}')
" 2>/dev/null && success "Cross-namespace Redis connected" || warn "Redis connectivity check failed (may need a moment)"

echo ""
success "Staging environment setup complete!"
echo ""
echo "============================================================"
echo "  Staging URL: https://staging.${DOMAIN}"
echo "============================================================"
echo ""
echo "  Cloudflare DNS setup required:"
echo "    Add CNAME: staging -> ${DOMAIN} (Proxied/Orange cloud)"
echo "    Or A record: staging.${DOMAIN} -> <node-2 IP>"
echo ""
echo "  Cache Rules: staging.${DOMAIN}/* -> Bypass Cache"
echo ""
echo "  Staging master key: $STAGING_MASTER_KEY"
echo ""
echo "  Useful commands:"
echo "    kubectl get pods -n $NAMESPACE -w"
echo "    kubectl logs deploy/backend -n $NAMESPACE --tail=50"
echo "    kubectl exec deploy/backend -n $NAMESPACE -- curl -s localhost:8000/health"
echo ""
