#!/bin/bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

print_status "Debugging Docker Compose deployment issues..."

# Change to infrastructure directory
cd "$SCRIPT_DIR"

# Determine which docker-compose command to use
DOCKER_COMPOSE_CMD="docker-compose"
if ! command -v docker-compose > /dev/null 2>&1; then
    if command -v docker > /dev/null 2>&1 && docker compose version > /dev/null 2>&1; then
        DOCKER_COMPOSE_CMD="docker compose"
    else
        print_error "Neither 'docker-compose' nor 'docker compose' is available"
        exit 1
    fi
fi

print_status "Using Docker Compose command: $DOCKER_COMPOSE_CMD"

# Stop any running containers
print_status "Stopping any running containers..."
$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml down || true

# Check Docker system status
print_status "Checking Docker system status..."
docker system df
echo ""
docker system info | head -20
echo ""

# Check available disk space
print_status "Checking disk space..."
df -h
echo ""

# Check if .env file exists and is readable
if [[ -f ".env" ]]; then
    print_success ".env file found"
    print_status "Environment variables (excluding passwords):"
    grep -v "PASSWORD\|SECRET\|KEY" .env || true
else
    print_error ".env file not found!"
    print_status "Creating basic .env file..."
    
    # Generate secure passwords
    POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    JWT_SECRET=$(openssl rand -base64 64 | tr -d "=+/" | cut -c1-50)
    API_SECRET_KEY=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    
    cat > .env << EOF
# Domain and SSL
DOMAIN_NAME=spotcompare.com
EMAIL=kp@spotcompare.com

# Database
POSTGRES_PASSWORD=$POSTGRES_PASSWORD

# Security
JWT_SECRET=$JWT_SECRET
API_SECRET_KEY=$API_SECRET_KEY

# Application
ENVIRONMENT=production
LOG_LEVEL=info
DEBUG=false

# Redis Configuration
REDIS_PASSWORD=$REDIS_PASSWORD

# Rate Limiting (requests per minute)
RATE_LIMIT_API=100
RATE_LIMIT_WS=60

# Monitoring (optional)
ENABLE_MONITORING=false

# Backup (optional)
BACKUP_ENABLED=false

# Scraper Configuration
SCRAPER_TIMEOUT=30
SCRAPER_RETRY_COUNT=3
SCRAPER_RATE_LIMIT=1
EOF
    print_success ".env file created"
fi

echo ""

# Check PostgreSQL configuration
print_status "Checking PostgreSQL configuration..."
if [[ -f "postgres/postgresql.conf" ]]; then
    print_success "PostgreSQL config found"
else
    print_error "PostgreSQL config missing - creating default"
    mkdir -p postgres
    cat > postgres/postgresql.conf << 'EOF'
# PostgreSQL production configuration
shared_buffers = 128MB
effective_cache_size = 512MB
work_mem = 4MB
maintenance_work_mem = 64MB

max_connections = 100
listen_addresses = '*'

log_destination = 'stderr'
logging_collector = off
log_min_duration_statement = 1000
log_connections = on
log_disconnections = on

autovacuum = on
EOF
fi

# Try to start services one by one
print_status "Starting PostgreSQL first..."
$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml up -d postgres

# Wait a moment and check logs
sleep 10
print_status "PostgreSQL logs:"
$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml logs postgres

# Check if PostgreSQL is healthy
print_status "Checking PostgreSQL health..."
if $DOCKER_COMPOSE_CMD -f docker-compose.prod.yml ps postgres | grep -q "Up"; then
    print_success "PostgreSQL is running"
else
    print_error "PostgreSQL failed to start"
    
    # Additional debugging
    print_status "Detailed PostgreSQL container info:"
    docker inspect infrastructure-postgres-1 | grep -A 10 -B 10 "Health\|Status\|Error" || true
    
    print_status "Trying to start PostgreSQL with manual command..."
    docker run --rm -e POSTGRES_PASSWORD=testpass postgres:15-alpine echo "PostgreSQL image is working"
    
    # Check if there's a permission issue
    print_status "Checking volume permissions..."
    ls -la /var/lib/docker/volumes/ | grep postgres || true
fi

print_status "Starting Redis..."
$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml up -d redis

sleep 5
print_status "Redis logs:"
$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml logs redis

# If PostgreSQL is working, try backend
if $DOCKER_COMPOSE_CMD -f docker-compose.prod.yml ps postgres | grep -q "Up"; then
    print_status "Starting backend..."
    $DOCKER_COMPOSE_CMD -f docker-compose.prod.yml up -d backend
    
    sleep 10
    print_status "Backend logs:"
    $DOCKER_COMPOSE_CMD -f docker-compose.prod.yml logs backend
fi

print_status "Current container status:"
$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml ps

print_status "Debugging complete. Check the logs above for specific error messages."