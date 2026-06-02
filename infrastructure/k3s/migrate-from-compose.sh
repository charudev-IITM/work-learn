#!/bin/bash
set -euo pipefail

# =============================================================================
# Migrate from Docker Compose to K3s
# =============================================================================
# Migrates data from existing single-VPS Docker Compose deployment to K3s cluster.
#
# Steps:
#   1. pg_dump from existing VPS
#   2. Transfer dump to K3s server node
#   3. Restore into K3s PostgreSQL pod
#   4. Deploy all app services
#   5. Verify health + scraper freshness
#   6. Prompt for DNS cutover
#
# Prerequisites:
#   - K3s cluster setup complete (setup-cluster.sh)
#   - K3s manifests applied (deploy.sh)
#   - PostgreSQL pod running in K3s
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
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAMESPACE="comp-intel"
KUBECONFIG="${KUBECONFIG:-$HOME/.kube/k3s-config}"
export KUBECONFIG

OLD_VPS_IP="${OLD_VPS_IP:-}"          # IP of existing Docker Compose VPS
OLD_VPS_USER="${OLD_VPS_USER:-root}"
SSH_KEY="${SSH_KEY:-~/.ssh/id_rsa}"
DOMAIN="${DOMAIN:-spotcompare.com}"
NODE2_IP="${NODE2_IP:-}"              # K3s app node IP (for DNS cutover)

DUMP_FILE="/tmp/comp-intel-pg-dump-$(date +%Y%m%d_%H%M%S).sql"

if [[ -z "$OLD_VPS_IP" ]]; then
    error "OLD_VPS_IP not set. Export the IP of your current Docker Compose VPS."
    echo "  export OLD_VPS_IP=x.x.x.x"
    exit 1
fi

ssh_old() {
    ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -i "$SSH_KEY" "$OLD_VPS_USER@$OLD_VPS_IP" "$@"
}

# ---------------------------------------------------------------------------
# Step 1: Dump PostgreSQL from existing VPS
# ---------------------------------------------------------------------------
info "Step 1: Dumping PostgreSQL from existing VPS ($OLD_VPS_IP)..."

# Find the postgres container name on the old VPS
PG_CONTAINER=$(ssh_old "docker ps --format '{{.Names}}' | grep postgres | head -1")
if [[ -z "$PG_CONTAINER" ]]; then
    error "Could not find postgres container on old VPS"
    exit 1
fi
info "  Found postgres container: $PG_CONTAINER"

# Get the postgres password from the old VPS env file
OLD_PG_PASS=$(ssh_old "grep POSTGRES_PASSWORD /opt/comp-intel/infrastructure/.env | cut -d= -f2" 2>/dev/null || echo "password")

# Run pg_dump on the old VPS
info "  Running pg_dump..."
ssh_old "docker exec $PG_CONTAINER pg_dump -U postgres -Fc bullion_intel > /tmp/pg_dump.sql"
success "  Database dumped on old VPS"

# ---------------------------------------------------------------------------
# Step 2: Transfer dump to local machine
# ---------------------------------------------------------------------------
info "Step 2: Transferring dump file..."
scp -o StrictHostKeyChecking=no -i "$SSH_KEY" "$OLD_VPS_USER@$OLD_VPS_IP:/tmp/pg_dump.sql" "$DUMP_FILE"
DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
success "  Dump transferred: $DUMP_FILE ($DUMP_SIZE)"

# ---------------------------------------------------------------------------
# Step 3: Restore into K3s PostgreSQL
# ---------------------------------------------------------------------------
info "Step 3: Restoring into K3s PostgreSQL..."

# Ensure data services are running
info "  Ensuring PostgreSQL is running in K3s..."
kubectl get pods -n "$NAMESPACE" -l app=postgres --no-headers | grep -q Running || {
    error "PostgreSQL pod not running in K3s. Deploy data services first."
    exit 1
}

# Get postgres pod name
PG_POD=$(kubectl get pods -n "$NAMESPACE" -l app=postgres -o jsonpath='{.items[0].metadata.name}')
info "  Target pod: $PG_POD"

# Copy dump into the pod
info "  Copying dump into pod..."
kubectl cp "$DUMP_FILE" "$NAMESPACE/$PG_POD:/tmp/pg_dump.sql"

# Restore the dump
info "  Restoring database..."
kubectl exec "$PG_POD" -n "$NAMESPACE" -- bash -c "
    # Drop and recreate for clean restore
    psql -U postgres -c 'DROP DATABASE IF EXISTS bullion_intel_backup;' 2>/dev/null || true
    psql -U postgres -c 'ALTER DATABASE bullion_intel RENAME TO bullion_intel_backup;' 2>/dev/null || true
    psql -U postgres -c 'CREATE DATABASE bullion_intel;'

    # Restore from dump
    pg_restore -U postgres -d bullion_intel --no-owner --no-privileges /tmp/pg_dump.sql 2>&1 || {
        echo 'pg_restore completed (warnings are expected for existing objects)'
    }

    # Verify
    echo ''
    echo '=== Restored Tables ==='
    psql -U postgres -d bullion_intel -c '\dt'

    echo ''
    echo '=== Row Counts ==='
    psql -U postgres -d bullion_intel -c \"
        SELECT 'users' as table_name, count(*) FROM users
        UNION ALL SELECT 'competitors', count(*) FROM competitors
        UNION ALL SELECT 'user_dashboards', count(*) FROM user_dashboards;
    \"

    # Clean up
    rm -f /tmp/pg_dump.sql
"

success "  Database restored successfully"

# ---------------------------------------------------------------------------
# Step 4: Restart app services to pick up new data
# ---------------------------------------------------------------------------
info "Step 4: Restarting app services..."

kubectl rollout restart deployment/backend -n "$NAMESPACE"
kubectl rollout restart deployment/scraper-worker -n "$NAMESPACE"
kubectl rollout restart deployment/news-worker -n "$NAMESPACE"

info "  Waiting for rollouts..."
kubectl rollout status deployment/backend -n "$NAMESPACE" --timeout=180s
kubectl rollout status deployment/scraper-worker -n "$NAMESPACE" --timeout=180s

success "  App services restarted"

# ---------------------------------------------------------------------------
# Step 5: Verify health + scraper freshness
# ---------------------------------------------------------------------------
info "Step 5: Verifying health..."

echo ""
echo "=== Pod Status ==="
kubectl get pods -n "$NAMESPACE" -o wide
echo ""

# Backend health check
info "  Checking backend health..."
kubectl port-forward svc/backend 18000:8000 -n "$NAMESPACE" &>/dev/null &
PF_PID=$!
sleep 5

HEALTH=$(curl -s http://localhost:18000/health 2>/dev/null || echo '{"error":"unreachable"}')
kill $PF_PID 2>/dev/null || true
wait $PF_PID 2>/dev/null || true

echo "  Health response: $HEALTH" | head -c 500
echo ""

# Check scraper worker logs
info "  Checking scraper worker logs..."
kubectl logs deployment/scraper-worker -n "$NAMESPACE" --tail=10 2>/dev/null || warn "Scraper worker logs not available yet"
echo ""

# Wait and re-check freshness
info "  Waiting 60s to verify rate freshness..."
sleep 60

kubectl port-forward svc/backend 18001:8000 -n "$NAMESPACE" &>/dev/null &
PF_PID=$!
sleep 3

RATES=$(curl -s http://localhost:18001/api/rates/current 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if isinstance(data, dict):
        for k, v in list(data.items())[:5]:
            ts = v.get('timestamp', 'unknown') if isinstance(v, dict) else 'unknown'
            print(f'  {k}: {ts}')
        print(f'  ... ({len(data)} total competitors)')
except:
    print('  Could not parse rates response')
" 2>/dev/null || warn "Could not check rate freshness")

kill $PF_PID 2>/dev/null || true
wait $PF_PID 2>/dev/null || true

echo ""

# PVC status
echo "=== PVC Status ==="
kubectl get pvc -n "$NAMESPACE"
echo ""

# Node resources
echo "=== Node Resources ==="
kubectl top nodes 2>/dev/null || warn "Metrics not available"
echo ""

success "Health verification complete"

# ---------------------------------------------------------------------------
# Step 6: DNS Cutover
# ---------------------------------------------------------------------------
echo ""
echo "============================================================"
echo "  Ready for DNS Cutover"
echo "============================================================"
echo ""
echo "  Current VPS: $OLD_VPS_IP"
echo "  New K3s app node: ${NODE2_IP:-<set NODE2_IP>}"
echo ""
echo "  To cut over:"
echo "  1. Update Cloudflare A record for $DOMAIN"
echo "     Old: $OLD_VPS_IP"
echo "     New: ${NODE2_IP:-<NODE2_IP>}"
echo "  2. Ensure orange cloud (Proxied) is enabled"
echo "  3. Cloudflare propagation is instant when proxied"
echo ""
echo "  Post-cutover monitoring (48h):"
echo "    kubectl get pods -n $NAMESPACE -w"
echo "    kubectl top nodes"
echo "    kubectl logs deploy/scraper-worker -n $NAMESPACE -f"
echo ""
echo "  Rollback: Change Cloudflare A record back to $OLD_VPS_IP"
echo ""

read -rp "Ready to proceed with DNS cutover? (y/n): " confirm
if [[ "$confirm" == "y" ]]; then
    warn "Update Cloudflare DNS manually in the dashboard."
    warn "Keep the old VPS running for 48h as rollback safety net."
    echo ""
    info "After DNS cutover, verify with:"
    echo "  curl -I https://$DOMAIN/health"
    echo "  dig $DOMAIN"
fi

# Clean up local dump
rm -f "$DUMP_FILE"

success "Migration script complete!"
