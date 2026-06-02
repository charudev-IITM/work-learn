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
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$SCRIPT_DIR/.env"
# Use the current directory as APP_DIR since we're running from the actual app location
APP_DIR="$(pwd)"

# Default values
DOMAIN_NAME=""
EMAIL=""
SKIP_SSL=false
SKIP_BACKUP=true
MONITORING=false
UPDATE_MODE=false
QUICK_MODE=false

# Detect if this is an update (if app directory already exists)
if [[ -d "$APP_DIR" && -f "$APP_DIR/infrastructure/.env" ]]; then
    UPDATE_MODE=true
    print_status "Update mode detected - existing deployment found"
fi

# Function to show usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  -d, --domain DOMAIN     Domain name for the application"
    echo "  -e, --email EMAIL       Email for Let's Encrypt certificates"
    echo "  --skip-ssl             Skip SSL certificate generation"
    echo "  --enable-monitoring    Enable monitoring stack"
    echo "  --enable-backup        Enable backup configuration"
    echo "  -q, --quick            Quick update mode (uses Docker cache, faster for code changes)"
    echo "  -h, --help             Show this help message"
    exit 1
}

# Parse command line arguments
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
        --skip-ssl)
            SKIP_SSL=true
            shift
            ;;
        --enable-monitoring)
            MONITORING=true
            shift
            ;;
        --enable-backup)
            SKIP_BACKUP=false
            shift
            ;;
        -q|--quick)
            QUICK_MODE=true
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

# In update mode, try to read domain from existing env file
if [[ "$UPDATE_MODE" == true && -z "$DOMAIN_NAME" ]]; then
    if [[ -f "$APP_DIR/infrastructure/.env" ]]; then
        DOMAIN_NAME=$(grep "^DOMAIN_NAME=" "$APP_DIR/infrastructure/.env" | cut -d'=' -f2)
        print_status "Using existing domain: $DOMAIN_NAME"
    fi
fi

# Validate required parameters
if [[ -z "$DOMAIN_NAME" ]]; then
    if [[ "$UPDATE_MODE" == true ]]; then
        print_error "Could not determine domain name from existing deployment. Please specify with -d"
    else
        print_error "Domain name is required for new deployment"
    fi
    usage
fi

if [[ "$SKIP_SSL" == false && -z "$EMAIL" && "$UPDATE_MODE" == false ]]; then
    print_error "Email is required for SSL certificate generation"
    usage
fi

if [[ "$UPDATE_MODE" == true ]]; then
    print_status "Starting update for domain: $DOMAIN_NAME"
else
    print_status "Starting fresh deployment for domain: $DOMAIN_NAME"
fi

# Check if running as root or with sudo
if [[ $EUID -ne 0 ]]; then
    print_error "This script must be run as root or with sudo"
    exit 1
fi

# Skip system setup for updates
if [[ "$UPDATE_MODE" == false ]]; then
    # Update system packages
    print_status "Updating system packages..."
    apt update && apt upgrade -y

    # Check if Docker is installed and working
    if ! docker --version > /dev/null 2>&1; then
        print_status "Docker not found or not working. Running Docker fix script..."
        SCRIPT_DIR_ABS=$(cd "$SCRIPT_DIR" && pwd)
        bash "$SCRIPT_DIR_ABS/fix-docker.sh"
    fi

    # Apply kernel tuning for high-connection workloads
    if [[ -f "$APP_DIR/infrastructure/sysctl.conf" ]]; then
        print_status "Applying kernel tuning from sysctl.conf..."
        cp "$APP_DIR/infrastructure/sysctl.conf" /etc/sysctl.d/99-comp-intel.conf
        sysctl -p /etc/sysctl.d/99-comp-intel.conf
        print_success "Kernel tuning applied"
    fi

    # Install other required packages
    print_status "Installing required packages..."
    apt install -y \
        nginx \
        certbot \
        python3-certbot-nginx \
        ufw \
        htop \
        curl \
        git \
        unzip

    # Start and enable Docker
    systemctl start docker
    systemctl enable docker

    # Add current user to docker group (if not root)
    if [[ -n "${SUDO_USER:-}" ]]; then
        usermod -aG docker "$SUDO_USER"
        print_warning "Please log out and log back in for docker group changes to take effect"
    fi

    # Configure firewall
    print_status "Configuring firewall..."
    ufw --force enable
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow ssh
    ufw allow http
    ufw allow https
else
    print_status "Skipping system setup (update mode)"
    # Ensure Docker is running
    systemctl start docker
fi

# Create/update application directory
print_status "Setting up application directory: $APP_DIR"
mkdir -p "$APP_DIR"

# Files are already in place since we're running from the actual app directory
if [[ "$UPDATE_MODE" == true ]]; then
    print_status "Code updated via git - stopping services for restart..."
    # Stop services before restarting with new code
    cd "$APP_DIR/infrastructure"
    if [[ -f "docker-compose.prod.yml" ]]; then
        print_status "Stopping services for update..."
        if command -v docker-compose > /dev/null 2>&1; then
            docker-compose -f docker-compose.prod.yml down
        else
            docker compose -f docker-compose.prod.yml down
        fi
    fi
    print_success "Services stopped - ready for restart with new code"
else
    print_status "Setting up fresh installation..."
    chmod +x infrastructure/deploy.sh
fi

# Create/update environment file
ENV_FILE="$APP_DIR/infrastructure/.env"
if [[ ! -f "$ENV_FILE" ]]; then
    print_status "Creating environment configuration..."
    cp "$APP_DIR/infrastructure/.env.template" "$ENV_FILE"
    
    # Generate secure passwords
    POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    JWT_SECRET=$(openssl rand -base64 64 | tr -d "=+/" | cut -c1-50)
    API_SECRET_KEY=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    
    # Update environment file
    sed -i "s/DOMAIN_NAME=.*/DOMAIN_NAME=$DOMAIN_NAME/" "$ENV_FILE"
    sed -i "s/EMAIL=.*/EMAIL=$EMAIL/" "$ENV_FILE"
    sed -i "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$POSTGRES_PASSWORD/" "$ENV_FILE"
    sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" "$ENV_FILE"
    sed -i "s/API_SECRET_KEY=.*/API_SECRET_KEY=$API_SECRET_KEY/" "$ENV_FILE"
    sed -i "s/REDIS_PASSWORD=.*/REDIS_PASSWORD=$REDIS_PASSWORD/" "$ENV_FILE"
    
    if [[ "$MONITORING" == true ]]; then
        sed -i "s/ENABLE_MONITORING=.*/ENABLE_MONITORING=true/" "$ENV_FILE"
    fi
    
    print_success "Environment file created with secure passwords"
else
    print_status "Environment file already exists, preserving existing configuration"
    # In update mode, we might need to add new environment variables
    if [[ "$UPDATE_MODE" == true ]]; then
        print_status "Checking for new environment variables..."
        # Add any new variables that might be missing (example)
        if ! grep -q "MASTER_KEY" "$ENV_FILE"; then
            echo "MASTER_KEY=super_secret_master_key_123!" >> "$ENV_FILE"
            print_success "Added MASTER_KEY to environment"
        fi
        if ! grep -q "RAZORPAY_KEY_ID" "$ENV_FILE"; then
            echo "" >> "$ENV_FILE"
            echo "# Razorpay Billing" >> "$ENV_FILE"
            echo "RAZORPAY_KEY_ID=" >> "$ENV_FILE"
            echo "RAZORPAY_KEY_SECRET=" >> "$ENV_FILE"
            echo "RAZORPAY_WEBHOOK_SECRET=" >> "$ENV_FILE"
            echo "RAZORPAY_PLAN_ID_MONTHLY=" >> "$ENV_FILE"
            echo "RAZORPAY_PLAN_ID_ANNUAL=" >> "$ENV_FILE"
            print_warning "Added Razorpay billing env vars - CONFIGURE BEFORE RESTART"
        fi
    fi
fi

# Update nginx configuration with domain
print_status "Configuring Nginx..."
sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN_NAME/g" "$APP_DIR/infrastructure/nginx/nginx.conf"

# Create SSL certificates directory
mkdir -p /etc/letsencrypt/live

# Handle SSL certificates
if [[ "$UPDATE_MODE" == false ]]; then
    # Generate SSL certificates for new deployments
    if [[ "$SKIP_SSL" == false ]]; then
        print_status "Generating SSL certificates..."
        
        # Stop nginx if running
        systemctl stop nginx 2>/dev/null || true
        
        # Generate certificate
        certbot certonly \
            --standalone \
            --agree-tos \
            --no-eff-email \
            --email "$EMAIL" \
            -d "$DOMAIN_NAME" \
            --non-interactive
        
        if [[ $? -eq 0 ]]; then
            print_success "SSL certificates generated successfully"
        else
            print_error "Failed to generate SSL certificates"
            exit 1
        fi
    else
        print_warning "Skipping SSL certificate generation"
        # Create dummy certificates for testing
        mkdir -p "/etc/letsencrypt/live/$DOMAIN_NAME"
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "/etc/letsencrypt/live/$DOMAIN_NAME/privkey.pem" \
            -out "/etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem" \
            -subj "/CN=$DOMAIN_NAME"
    fi
else
    print_status "Skipping SSL certificate handling (update mode - using existing certificates)"
fi

# Build and start containers
print_status "Building and starting containers..."
cd "$APP_DIR/infrastructure"

# Load environment variables
source "$ENV_FILE"

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

# Handle container deployment - always use Docker cache for speed
print_status "Building containers (using Docker cache)..."
$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml build

if [[ "$UPDATE_MODE" == true ]]; then
    # Handle database migrations if needed
    print_status "Running database migrations..."
    # Start postgres first to ensure it's ready
    $DOCKER_COMPOSE_CMD -f docker-compose.prod.yml up -d postgres redis
    sleep 10

    # Note: Add database migration commands here if needed
    # Example: $DOCKER_COMPOSE_CMD -f docker-compose.prod.yml exec -T backend python migrate.py

    print_success "Database preparation completed"
fi

# Start services
COMPOSE_PROFILES=""
if [[ "$MONITORING" == true ]]; then
    COMPOSE_PROFILES="monitoring"
fi

# Rolling restart: bring up infra first, then app services
print_status "Starting infrastructure services..."
$DOCKER_COMPOSE_CMD -f docker-compose.prod.yml up -d postgres redis nginx

# Wait for infrastructure readiness
print_status "Waiting for infrastructure readiness..."
for i in $(seq 1 15); do
    if $DOCKER_COMPOSE_CMD -f docker-compose.prod.yml exec -T postgres pg_isready -q 2>/dev/null; then
        print_success "PostgreSQL is ready"
        break
    fi
    sleep 2
done

# Restart app services with force-recreate
print_status "Starting application services..."
if [[ -n "$COMPOSE_PROFILES" ]]; then
    $DOCKER_COMPOSE_CMD -f docker-compose.prod.yml --profile "$COMPOSE_PROFILES" up -d --force-recreate backend scraper-worker
else
    $DOCKER_COMPOSE_CMD -f docker-compose.prod.yml up -d --force-recreate backend scraper-worker
fi

# Health check with retry loop
print_status "Waiting for backend health check..."
HEALTHY=false
for i in $(seq 1 20); do
    BACKEND_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" https://localhost/health --insecure 2>/dev/null || echo "000")
    if [[ "$BACKEND_HEALTH" == "200" ]]; then
        print_success "Backend service is healthy (attempt $i)"
        HEALTHY=true
        break
    fi
    sleep 3
done

if [[ "$HEALTHY" != true ]]; then
    print_error "Backend service did not become healthy after 60s (HTTP $BACKEND_HEALTH)"
    print_warning "Check logs: $DOCKER_COMPOSE_CMD -f docker-compose.prod.yml logs backend"
fi

# Setup system configuration (only for new deployments)
if [[ "$UPDATE_MODE" == false ]]; then
    # Setup log rotation
    print_status "Setting up log rotation..."
    cat > /etc/logrotate.d/comp-intel << EOF
/opt/comp-intel/backend/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    notifempty
    sharedscripts
    postrotate
        if command -v docker-compose > /dev/null 2>&1; then
            docker-compose -f /opt/comp-intel/infrastructure/docker-compose.prod.yml restart backend
        else
            docker compose -f /opt/comp-intel/infrastructure/docker-compose.prod.yml restart backend
        fi
    endscript
}
EOF

    # Create systemd service for auto-start
    print_status "Creating systemd service..."
    cat > /etc/systemd/system/comp-intel.service << EOF
[Unit]
Description=Comp Intel Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/comp-intel/infrastructure
ExecStart=/bin/bash -c 'if command -v docker-compose > /dev/null 2>&1; then docker-compose -f docker-compose.prod.yml up -d; else docker compose -f docker-compose.prod.yml up -d; fi'
ExecStop=/bin/bash -c 'if command -v docker-compose > /dev/null 2>&1; then docker-compose -f docker-compose.prod.yml down; else docker compose -f docker-compose.prod.yml down; fi'
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable comp-intel.service
    print_success "Systemd service created and enabled"
fi

# Create backup script
if [[ "$SKIP_BACKUP" == false && "$UPDATE_MODE" == false ]]; then
    print_status "Creating backup script..."
    cat > /opt/comp-intel/backup.sh << 'EOF'
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/opt/comp-intel/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup database
docker exec comp-intel_postgres_1 pg_dump -U postgres bullion_intel | gzip > "$BACKUP_DIR/db_backup_$DATE.sql.gz"

# Backup Redis
docker exec comp-intel_redis_1 redis-cli BGSAVE
docker cp comp-intel_redis_1:/data/dump.rdb "$BACKUP_DIR/redis_backup_$DATE.rdb"

# Cleanup old backups (keep last 7 days)
find "$BACKUP_DIR" -name "*backup*" -mtime +7 -delete

echo "Backup completed: $DATE"
EOF
    chmod +x /opt/comp-intel/backup.sh
    
    # Add to crontab
    (crontab -l 2>/dev/null; echo "0 2 * * * /opt/comp-intel/backup.sh") | crontab -
    print_success "Backup script created and scheduled"
fi

# Schedule dealer metadata scrape (weekly, Sunday 3am)
if [[ "$UPDATE_MODE" == false ]]; then
    print_status "Scheduling weekly dealer metadata scrape..."
    chmod +x "$APP_DIR/infrastructure/cron/dealer-metadata.sh"
    if ! crontab -l 2>/dev/null | grep -q "dealer-metadata"; then
        (crontab -l 2>/dev/null; echo "0 3 * * 0 /opt/comp-intel/infrastructure/cron/dealer-metadata.sh >> /var/log/dealer-metadata.log 2>&1") | crontab -
        print_success "Dealer metadata scrape scheduled (weekly Sunday 3am)"
    else
        print_status "Dealer metadata cron already exists, skipping"
    fi
fi

# Setup SSL renewal
if [[ "$SKIP_SSL" == false ]]; then
    print_status "Setting up SSL certificate renewal..."
    if command -v docker-compose > /dev/null 2>&1; then
        (crontab -l 2>/dev/null; echo "0 12 * * * certbot renew --quiet && docker-compose -f /opt/comp-intel/infrastructure/docker-compose.prod.yml restart nginx") | crontab -
    else
        (crontab -l 2>/dev/null; echo "0 12 * * * certbot renew --quiet && docker compose -f /opt/comp-intel/infrastructure/docker-compose.prod.yml restart nginx") | crontab -
    fi
    print_success "SSL certificate renewal scheduled"
fi

# Create systemd service for auto-start
print_status "Creating systemd service..."
cat > /etc/systemd/system/comp-intel.service << EOF
[Unit]
Description=Comp Intel Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/comp-intel/infrastructure
ExecStart=/bin/bash -c 'if command -v docker-compose > /dev/null 2>&1; then docker-compose -f docker-compose.prod.yml up -d; else docker compose -f docker-compose.prod.yml up -d; fi'
ExecStop=/bin/bash -c 'if command -v docker-compose > /dev/null 2>&1; then docker-compose -f docker-compose.prod.yml down; else docker compose -f docker-compose.prod.yml down; fi'
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable comp-intel.service
print_success "Systemd service created and enabled"

# Final status check
print_status "Performing final health checks..."
sleep 10

SERVICES=("nginx" "backend" "frontend" "postgres" "redis")
for service in "${SERVICES[@]}"; do
    if docker compose -f docker-compose.prod.yml ps "$service" | grep -q "Up"; then
        print_success "$service is running"
    else
        print_error "$service is not running"
    fi
done

# Show deployment summary
print_success "Deployment completed successfully!"
echo ""
echo "=== Deployment Summary ==="
echo "Domain: https://$DOMAIN_NAME"
echo "Application: https://$DOMAIN_NAME"
echo "API Docs: https://$DOMAIN_NAME/docs"
echo "Health Check: https://$DOMAIN_NAME/health"
echo ""
echo "=== Management Commands ==="
echo "View logs: docker compose -f /opt/comp-intel/infrastructure/docker-compose.prod.yml logs -f"
echo "Restart services: docker compose -f /opt/comp-intel/infrastructure/docker-compose.prod.yml restart"
echo "Quick update: cd /opt/comp-intel && git pull && ./infrastructure/deploy.sh --quick"
echo "Full update: cd /opt/comp-intel && git pull && ./infrastructure/deploy.sh"
echo "Manual rebuild: docker compose -f /opt/comp-intel/infrastructure/docker-compose.prod.yml up -d --build"
echo "View service status: docker compose -f /opt/comp-intel/infrastructure/docker-compose.prod.yml ps"
echo ""
echo "=== Important Files ==="
echo "Environment config: /opt/comp-intel/infrastructure/.env"
echo "Nginx logs: /var/log/nginx/"
echo "Application logs: /opt/comp-intel/backend/logs/"
echo "SSL certificates: /etc/letsencrypt/live/$DOMAIN_NAME/"
echo ""

if [[ "$SKIP_BACKUP" == false ]]; then
    echo "=== Backup Information ==="
    echo "Backup script: /opt/comp-intel/backup.sh"
    echo "Backup directory: /opt/comp-intel/backups/"
    echo "Backup schedule: Daily at 2:00 AM"
    echo ""
fi

print_warning "Please save the passwords from /opt/comp-intel/infrastructure/.env"
print_warning "Consider setting up monitoring and alerting for production use"