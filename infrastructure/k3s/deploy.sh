#!/bin/bash
set -euo pipefail

# =============================================================================
# K3s Deploy Script for Competitive Intelligence Platform
# =============================================================================
# Builds images, pushes to DO Container Registry, applies K3s manifests,
# and performs rolling restart with health verification.
#
# Usage:
#   ./deploy.sh                    # Full production deploy (build + push + apply)
#   ./deploy.sh --env staging      # Full staging deploy
#   ./deploy.sh --apply-only       # Only apply manifests (no build)
#   ./deploy.sh --build-only       # Only build and push images
#   ./deploy.sh --env staging --apply-only  # Apply staging manifests only
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
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Allow git commands in CI-owned directories
git config --global --add safe.directory "$PROJECT_ROOT" 2>/dev/null || true

REGISTRY="${REGISTRY:-registry.digitalocean.com/comp-intel}"
DOMAIN="${DOMAIN:-spotcompare.com}"
KUBECONFIG="${KUBECONFIG:-$HOME/.kube/k3s-config}"

export KUBECONFIG

# Parse args
DEPLOY_ENV="production"
APPLY_ONLY=false
BUILD_ONLY=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --env) DEPLOY_ENV="$2"; shift 2 ;;
        --apply-only) APPLY_ONLY=true; shift ;;
        --build-only) BUILD_ONLY=true; shift ;;
        *) error "Unknown option: $1"; exit 1 ;;
    esac
done

# Environment-specific configuration
if [[ "$DEPLOY_ENV" == "staging" ]]; then
    NAMESPACE="comp-intel-staging"
    MANIFESTS_DIR="$SCRIPT_DIR/staging"
    IMAGE_TAG="${IMAGE_TAG:-staging-$(cd "$PROJECT_ROOT" && git rev-parse --short HEAD)}"
else
    NAMESPACE="comp-intel"
    MANIFESTS_DIR="$SCRIPT_DIR"
    IMAGE_TAG="${IMAGE_TAG:-$(cd "$PROJECT_ROOT" && git rev-parse --short HEAD)}"
fi

info "Deploy configuration:"
echo "  Environment: $DEPLOY_ENV"
echo "  Namespace:   $NAMESPACE"
echo "  Registry:    $REGISTRY"
echo "  Tag:         $IMAGE_TAG"
echo "  Domain:      $DOMAIN"
echo "  Manifests:   $MANIFESTS_DIR"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Build Docker images
# ---------------------------------------------------------------------------
build_images() {
    info "Building Docker images (tag: $IMAGE_TAG)..."
    cd "$PROJECT_ROOT"

    # Backend image (used by backend, scraper-worker, news-worker)
    info "Building backend image..."
    docker build \
        -f docker/Dockerfile.backend \
        -t "$REGISTRY/backend:$IMAGE_TAG" \
        -t "$REGISTRY/backend:latest" \
        .

    # Frontend image — staging can use a separate Turnstile site key
    local TURNSTILE_KEY="${VITE_TURNSTILE_SITE_KEY:-0x4AAAAAACqABnmr8Cq7v3LD}"
    info "Building frontend image..."
    docker build \
        -f docker/Dockerfile.frontend \
        --build-arg VITE_API_URL="" \
        --build-arg VITE_WS_URL="" \
        --build-arg VITE_TURNSTILE_SITE_KEY="$TURNSTILE_KEY" \
        -t "$REGISTRY/frontend:$IMAGE_TAG" \
        -t "$REGISTRY/frontend:latest" \
        .

    # Admin frontend image
    info "Building admin-frontend image..."
    docker build \
        -f docker/Dockerfile.admin \
        -t "$REGISTRY/admin-frontend:$IMAGE_TAG" \
        -t "$REGISTRY/admin-frontend:latest" \
        .

    success "Images built successfully"
}

# ---------------------------------------------------------------------------
# Step 2: Push to DO Container Registry
# ---------------------------------------------------------------------------
push_images() {
    info "Pushing images to $REGISTRY..."

    # Auth with DO registry (doctl preferred, DO_TOKEN fallback)
    if command -v doctl &>/dev/null; then
        doctl registry login 2>/dev/null || warn "doctl login failed, trying DO_TOKEN..."
    fi
    if [[ -n "${DO_TOKEN:-}" ]]; then
        echo "$DO_TOKEN" | docker login registry.digitalocean.com -u "$DO_TOKEN" --password-stdin 2>/dev/null
    fi

    docker push "$REGISTRY/backend:$IMAGE_TAG"
    docker push "$REGISTRY/backend:latest"
    docker push "$REGISTRY/frontend:$IMAGE_TAG"
    docker push "$REGISTRY/frontend:latest"

    docker push "$REGISTRY/admin-frontend:$IMAGE_TAG"
    docker push "$REGISTRY/admin-frontend:latest"

    success "Images pushed successfully"
}

# ---------------------------------------------------------------------------
# Step 3: Apply K3s manifests
# ---------------------------------------------------------------------------
apply_manifests() {
    info "Applying K3s manifests..."

    # Create temp dir with processed manifests
    local tmpdir
    tmpdir=$(mktemp -d)
    trap "rm -rf $tmpdir" EXIT

    # Copy and process manifests — replace placeholders
    for f in "$MANIFESTS_DIR"/*.yaml; do
        local basename
        basename=$(basename "$f")
        # Skip secrets and certs (one-time setup, managed by setup-cluster.sh / setup-staging.sh)
        if [[ "$basename" == "01-secrets.yaml" || "$basename" == "13-origin-ca.yaml" ]]; then
            continue
        fi
        sed \
            -e "s|REGISTRY_PLACEHOLDER|$REGISTRY|g" \
            -e "s|IMAGE_TAG|$IMAGE_TAG|g" \
            -e "s|DOMAIN_PLACEHOLDER|$DOMAIN|g" \
            "$f" > "$tmpdir/$basename"
    done

    # Validate that all required (non-optional) secret keys exist in the live secret
    info "Validating secret key references..."
    local referenced_keys
    # Extract secretKeyRef keys, skipping those marked optional: true
    referenced_keys=$(python3 -c "
import re, glob, os
keys = []
for f in glob.glob(os.path.join('$tmpdir', '*.yaml')):
    content = open(f).read()
    for m in re.finditer(r'secretKeyRef:\s*\n\s*name:\s*\S+\s*\n\s*key:\s*(\S+)(\s*\n\s*optional:\s*(\S+))?', content):
        key = m.group(1).strip('\"')
        optional = (m.group(3) or '').strip('\"')
        if optional != 'true':
            keys.append(key)
print('\n'.join(sorted(set(keys))))
" 2>/dev/null || true)

    if [[ -n "$referenced_keys" ]]; then
        local live_keys
        live_keys=$(kubectl get secret app-secrets -n "$NAMESPACE" -o json 2>/dev/null \
            | python3 -c "import sys,json; [print(k) for k in json.load(sys.stdin).get('data',{})]" 2>/dev/null || echo "")

        if [[ -n "$live_keys" ]]; then
            local missing=()
            while IFS= read -r key; do
                if ! echo "$live_keys" | grep -q "^${key}$"; then
                    missing+=("$key")
                fi
            done <<< "$referenced_keys"

            if [[ ${#missing[@]} -gt 0 ]]; then
                warn "Secret keys referenced in manifests but missing from live 'app-secrets':"
                for key in "${missing[@]}"; do
                    echo "  - $key"
                done
                echo ""
                echo "  Diagnostic — live keys found: $(echo "$live_keys" | tr '\n' ', ')"
                echo "  Diagnostic — required keys:   $(echo "$referenced_keys" | tr '\n' ', ')"
                echo ""
                echo "  Fix: kubectl patch secret app-secrets -n $NAMESPACE --type merge -p '{\"stringData\":{\"KEY\":\"VALUE\"}}'"
                echo ""
                warn "Continuing deploy — missing keys may cause pod startup failures if not optional in code"
            fi
            success "All referenced secret keys exist in live secret"
        else
            warn "Could not read live secret 'app-secrets' — skipping validation"
        fi
    fi

    # Apply in order
    for f in $(ls "$tmpdir"/*.yaml | sort); do
        info "  Applying $(basename "$f")..."
        kubectl apply -f "$f"
    done

    success "All manifests applied"
}

# ---------------------------------------------------------------------------
# Step 4: Rolling restart of app deployments
# ---------------------------------------------------------------------------
rolling_restart() {
    info "Rolling restart of application deployments..."

    # Restart app-tier deployments (new image tag triggers rollout)
    kubectl rollout restart deployment/backend -n "$NAMESPACE"
    kubectl rollout restart deployment/frontend -n "$NAMESPACE"

    # Restart admin panel (both environments)
    kubectl rollout restart deployment/admin-frontend -n "$NAMESPACE" 2>/dev/null || true

    # Restart workers (production only — staging shares production scrapers)
    if [[ "$DEPLOY_ENV" == "production" ]]; then
        kubectl rollout restart deployment/scraper-worker -n "$NAMESPACE"
        kubectl rollout restart deployment/news-worker -n "$NAMESPACE"
    fi

    # Wait for rollouts to complete
    info "Waiting for backend rollout..."
    kubectl rollout status deployment/backend -n "$NAMESPACE" --timeout=180s

    info "Waiting for frontend rollout..."
    kubectl rollout status deployment/frontend -n "$NAMESPACE" --timeout=120s

    if [[ "$DEPLOY_ENV" == "production" ]]; then
        info "Waiting for scraper-worker rollout..."
        kubectl rollout status deployment/scraper-worker -n "$NAMESPACE" --timeout=180s

        info "Waiting for news-worker rollout..."
        kubectl rollout status deployment/news-worker -n "$NAMESPACE" --timeout=120s
    fi

    success "All rollouts completed"
}

# ---------------------------------------------------------------------------
# Step 5: Health check verification
# ---------------------------------------------------------------------------
health_check() {
    info "Running health checks..."
    echo ""

    # Check all pods are Running
    echo "=== Pod Status ==="
    kubectl get pods -n "$NAMESPACE" -o wide
    echo ""

    # Check for any crash loops
    local restarts
    restarts=$(kubectl get pods -n "$NAMESPACE" -o jsonpath='{range .items[*]}{.status.containerStatuses[*].restartCount}{"\n"}{end}' 2>/dev/null | awk '{s+=$1} END {print s}')
    if [[ "${restarts:-0}" -gt 0 ]]; then
        warn "Total pod restarts: $restarts — check logs for crash loops"
    fi

    # Backend health check via port-forward
    info "Checking backend health..."
    kubectl port-forward svc/backend 18000:8000 -n "$NAMESPACE" &>/dev/null &
    local pf_pid=$!

    local health_status="000"
    for i in $(seq 1 10); do
        health_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:18000/health 2>/dev/null || echo "000")
        [[ "$health_status" == "200" ]] && break
        sleep 1
    done
    kill $pf_pid 2>/dev/null || true
    wait $pf_pid 2>/dev/null || true

    if [[ "$health_status" == "200" ]]; then
        success "Backend health check passed (HTTP $health_status)"
    else
        error "Backend health check failed (HTTP $health_status)"
    fi

    # Check PVCs
    echo ""
    echo "=== PVC Status ==="
    kubectl get pvc -n "$NAMESPACE"

    # Check node resources
    echo ""
    echo "=== Node Resources ==="
    kubectl top nodes 2>/dev/null || warn "Metrics not available yet"
    echo ""
}

# ---------------------------------------------------------------------------
# Step 6: Run database migrations via psql on the postgres pod
# Pipes each .sql file through stdin — no file copying, no intermediate pods.
# Uses a schema_migrations tracking table to skip already-applied files.
# Must run BEFORE rolling_restart (new code may reference new columns).
# ---------------------------------------------------------------------------
run_migrations() {
    local migrations_dir="$PROJECT_ROOT/backend/migrations"
    if [[ ! -d "$migrations_dir" ]]; then
        warn "No migrations directory found — skipping"
        return
    fi

    local sql_files
    sql_files=$(ls "$migrations_dir"/*.sql 2>/dev/null | sort)
    if [[ -z "$sql_files" ]]; then
        warn "No migration SQL files found — skipping"
        return
    fi

    # Postgres resource type differs between environments
    local pg_resource db_name
    if [[ "$DEPLOY_ENV" == "staging" ]]; then
        pg_resource="deploy/postgres"
        db_name="bullion_intel_staging"
    else
        pg_resource="statefulset/postgres"
        db_name="bullion_intel"
    fi

    # Helper: run a psql command on the postgres pod
    _psql() {
        kubectl exec -i "$pg_resource" -n "$NAMESPACE" -- \
            psql -U postgres -d "$db_name" "$@"
    }

    info "Running database migrations..."

    # 1. Ensure tracking table exists
    _psql -c "CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );" >/dev/null 2>&1

    # 2. Fetch already-applied migrations in one round-trip
    local applied
    applied=$(_psql -tAc "SELECT filename FROM schema_migrations;")

    # 3. Apply each pending migration
    local pending=0
    for f in $sql_files; do
        local name
        name=$(basename "$f")

        if echo "$applied" | grep -qxF "$name"; then
            continue  # Already applied — silent skip
        fi

        # Pipe migration SQL + tracking INSERT as a single transaction.
        # --single-transaction: atomic — if any statement fails, everything rolls back.
        # ON_ERROR_STOP=1: abort on first error (don't silently continue).
        if { cat "$f"; echo "INSERT INTO schema_migrations (filename) VALUES ('$name');"; } \
            | _psql --single-transaction -v ON_ERROR_STOP=1 -f - >/dev/null 2>&1; then
            echo "  OK: $name"
            pending=$((pending + 1))
        else
            error "Migration FAILED: $name"
            error "Aborting deploy — fix the migration and retry."
            return 1
        fi
    done

    if [[ $pending -eq 0 ]]; then
        success "Migrations up to date ($(echo "$sql_files" | wc -w | tr -d ' ') tracked)"
    else
        success "Applied $pending new migration(s)"
    fi
}

# ---------------------------------------------------------------------------
# Step 7: Cloudflare cache purge (HTML only, hashed assets don't need purging)
# ---------------------------------------------------------------------------
purge_cf_cache() {
    if [[ -z "${CF_API_TOKEN:-}" || -z "${CF_ZONE_ID:-}" ]]; then
        warn "CF_API_TOKEN or CF_ZONE_ID not set — skipping Cloudflare cache purge"
        warn "Set these env vars to enable automatic cache purging"
        return
    fi

    info "Purging Cloudflare cache for HTML..."
    curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/purge_cache" \
        -H "Authorization: Bearer $CF_API_TOKEN" \
        -H "Content-Type: application/json" \
        --data "{\"files\":[\"https://app.$DOMAIN/\",\"https://app.$DOMAIN/index.html\"]}" \
        | python3 -c "import sys,json; r=json.load(sys.stdin); print('  Purge success' if r.get('success') else f'  Purge failed: {r}')" \
        2>/dev/null || warn "Cache purge request failed"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if [[ "$APPLY_ONLY" == true ]]; then
    apply_manifests
    run_migrations      # Migrations BEFORE restart — new code may depend on new columns
    rolling_restart
    health_check
    [[ "$DEPLOY_ENV" == "production" ]] && purge_cf_cache
elif [[ "$BUILD_ONLY" == true ]]; then
    build_images
    push_images
else
    build_images
    push_images
    apply_manifests
    run_migrations      # Migrations BEFORE restart — new code may depend on new columns
    rolling_restart
    health_check
    [[ "$DEPLOY_ENV" == "production" ]] && purge_cf_cache
fi

echo ""
success "Deploy complete!"
echo ""
echo "=== Useful Commands ==="
echo "  kubectl get pods -n $NAMESPACE -w       # Watch pods"
echo "  kubectl logs deploy/backend -n $NAMESPACE --tail=50  # Backend logs"
echo "  kubectl logs deploy/scraper-worker -n $NAMESPACE --tail=50  # Scraper logs"
echo "  kubectl top nodes                        # Resource usage"
echo "  kubectl exec deploy/backend -n $NAMESPACE -- curl -s localhost:8000/health  # Health"
