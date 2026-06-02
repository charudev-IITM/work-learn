# Production Deployment Guide

## Prerequisites

### 1. Server Requirements
- **OS**: Ubuntu 20.04+ / CentOS 8+ / RHEL 8+
- **RAM**: Minimum 4GB, Recommended 8GB+
- **CPU**: Minimum 2 cores, Recommended 4+ cores
- **Storage**: Minimum 20GB SSD
- **Network**: Public IP with ports 80 and 443 open

### 2. Software Requirements
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installations
docker --version
docker-compose --version
```

### 3. Domain & SSL Setup
1. **Domain**: Point your domain's A record to your server's IP
2. **SSL Certificate**: Obtain SSL certificates using Let's Encrypt:

```bash
# Install certbot
sudo apt update
sudo apt install certbot

# Get SSL certificate
sudo certbot certonly --standalone -d your-domain.com

# Create ssl directory and copy certificates
mkdir -p ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ssl/
sudo chown $USER:$USER ssl/*.pem
```

## Deployment Steps

### 1. Clone Repository
```bash
git clone https://github.com/your-username/comp-intel.git
cd comp-intel
```

### 2. Configure Environment
```bash
# Copy and edit production environment file
cp .env.prod.example .env.prod
nano .env.prod
```

**Required Environment Variables:**
```bash
# Database - Use strong password
POSTGRES_PASSWORD=your_secure_postgres_password_here

# Redis - Use strong password  
REDIS_PASSWORD=your_secure_redis_password_here

# JWT Secret - Generate with: openssl rand -hex 32
JWT_SECRET=your_jwt_secret_minimum_32_characters_long

# Master key for user registration restriction
MASTER_KEY=your_master_key_here

# Your domain name
DOMAIN=your-domain.com
```

### 3. Deploy Application
```bash
# Run the automated deployment script
sudo ./infrastructure/deploy.sh -d your-domain.com -e your-email@domain.com
```

The script will:
- ✅ Validate environment variables and SSL certificates
- 🛑 Stop any existing containers
- 🔄 Build and start all services
- ⏳ Wait for health checks to pass
- 🗄️ Initialize the database
- 📊 Display service status

### 4. Verify Deployment
```bash
# Check service status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Test endpoints
curl https://your-domain.com/health
curl https://your-domain.com/api/health
```

## Service Architecture

```
Internet → Nginx (443) → Frontend (React) + Backend API
                      ↓
                   Backend (FastAPI) ← → Redis
                      ↓
                   PostgreSQL
```

### Service Details
- **Nginx**: Reverse proxy, SSL termination, static file serving
- **Frontend**: React SPA served by Nginx
- **Backend**: FastAPI with 12 real-time scrapers
- **PostgreSQL**: User data, watchlists, authentication
- **Redis**: Rate caching, session management

## Security Features

### 1. SSL/TLS Configuration
- TLS 1.2 and 1.3 only
- Strong cipher suites
- HSTS headers
- Security headers (XSS, CSRF, etc.)

### 2. Rate Limiting
- API endpoints: 10 requests/second
- WebSocket connections: 5 connections/second
- Configurable burst limits

### 3. Authentication
- JWT-based authentication
- Master key signup restriction
- Secure password hashing
- Token expiry and refresh

### 4. Network Security
- Internal Docker network isolation
- Non-root container users
- Health check endpoints
- Request timeout limits

## Monitoring & Maintenance

### 1. Log Management
```bash
# View all logs
docker-compose -f docker-compose.prod.yml logs -f

# View specific service logs
docker-compose -f docker-compose.prod.yml logs -f backend
docker-compose -f docker-compose.prod.yml logs -f frontend
docker-compose -f docker-compose.prod.yml logs -f nginx

# Log rotation (add to crontab)
0 0 * * * docker system prune -f
```

### 2. Database Backup
```bash
# Create backup script
cat > backup-db.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker-compose -f docker-compose.prod.yml exec -T postgres pg_dump -U postgres comp_intel | gzip > backup_${DATE}.sql.gz
EOF

chmod +x backup-db.sh

# Add to crontab for daily backups
0 2 * * * /path/to/backup-db.sh
```

### 3. SSL Certificate Renewal
```bash
# Add to crontab for auto-renewal
0 3 */30 * * certbot renew --quiet && docker-compose -f docker-compose.prod.yml restart nginx
```

### 4. System Updates
```bash
# Update application
git pull origin main
sudo ./infrastructure/deploy.sh -d your-domain.com --quick

# Update system packages
sudo apt update && sudo apt upgrade -y
sudo reboot  # if kernel updates
```

## Troubleshooting

### Common Issues

#### 1. Services Not Starting
```bash
# Check container logs
docker-compose -f docker-compose.prod.yml logs

# Check resource usage
docker stats

# Check disk space
df -h
```

#### 2. Database Connection Issues
```bash
# Check PostgreSQL logs
docker-compose -f docker-compose.prod.yml logs postgres

# Test database connection
docker-compose -f docker-compose.prod.yml exec postgres psql -U postgres -d comp_intel -c "SELECT version();"
```

#### 3. WebSocket Connection Issues
```bash
# Check nginx configuration
docker-compose -f docker-compose.prod.yml exec nginx nginx -t

# Test WebSocket endpoint
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" https://your-domain.com/ws/rates
```

#### 4. SSL Certificate Issues
```bash
# Check certificate validity
openssl x509 -in ssl/fullchain.pem -text -noout

# Test SSL configuration
curl -I https://your-domain.com
```

### Performance Optimization

#### 1. Database Tuning
```bash
# Edit PostgreSQL configuration
docker-compose -f docker-compose.prod.yml exec postgres psql -U postgres -c "
  ALTER SYSTEM SET shared_buffers = '256MB';
  ALTER SYSTEM SET effective_cache_size = '1GB';
  ALTER SYSTEM SET maintenance_work_mem = '64MB';
  SELECT pg_reload_conf();
"
```

#### 2. Redis Optimization
```bash
# Monitor Redis performance
docker-compose -f docker-compose.prod.yml exec redis redis-cli info memory
docker-compose -f docker-compose.prod.yml exec redis redis-cli info stats
```

#### 3. Application Scaling
```bash
# Scale backend workers
docker-compose -f docker-compose.prod.yml up -d --scale backend=3
```

## Support

- **Documentation**: Check CLAUDE.md for development details
- **Logs**: All services log to `/logs/` directory
- **Health Checks**: Available at `/health` endpoints
- **Monitoring**: Use Docker stats and service logs

For issues, check the troubleshooting section above or review application logs for specific error messages.