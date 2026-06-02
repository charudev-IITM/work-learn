# Comp Intel Infrastructure

This directory contains deployment configurations for the Comp Intel bullion rate comparison platform.

## Deployment Options

### 1. Single Server Docker Compose (Recommended for start)
**Cost: ~$20-40/month**
- All services on one DigitalOcean droplet
- Docker Compose orchestration
- Nginx with SSL termination
- Auto-scaling disabled

```bash
# Deploy to DigitalOcean droplet
./deploy.sh --domain your-domain.com --email your-email@domain.com

# With monitoring
./deploy.sh --domain your-domain.com --email your-email@domain.com --enable-monitoring
```

### 2. Kubernetes Cluster (For scaling)
**Cost: ~$60-200/month**
- DigitalOcean Kubernetes cluster
- Horizontal Pod Autoscaling
- Load balancing and high availability
- Container orchestration

```bash
# Deploy to Kubernetes cluster
./k8s/deploy-k8s.sh --domain your-domain.com --email your-email@domain.com --registry your-registry.com/username
```

## File Structure

```
infrastructure/
├── docker-compose.prod.yml     # Production Docker Compose
├── deploy.sh                   # Single server deployment script
├── .env.template              # Environment variables template
├── nginx/                     # Nginx configuration
├── postgres/                  # PostgreSQL configuration
├── redis/                     # Redis configuration
├── monitoring/                # Monitoring stack (Prometheus, Grafana)
├── k8s/                      # Kubernetes manifests
│   ├── deploy-k8s.sh         # K8s deployment script
│   ├── namespace.yaml        # Namespace definition
│   ├── secrets.yaml          # Secrets and ConfigMaps
│   ├── storage.yaml          # Persistent volumes
│   ├── postgres.yaml         # PostgreSQL deployment
│   ├── redis.yaml            # Redis deployment
│   ├── backend.yaml          # Backend deployment
│   ├── frontend.yaml         # Frontend deployment
│   ├── ingress.yaml          # Ingress configuration
│   └── hpa.yaml             # Horizontal Pod Autoscaler
└── README.md                 # This file
```

## Quick Start Guide

### Prerequisites
- Domain name with DNS control
- DigitalOcean account (or other cloud provider)
- Docker and Docker Compose installed
- For K8s: kubectl configured with cluster access

### Single Server Deployment

1. **Create DigitalOcean Droplet**
   - Size: 4GB RAM, 2 vCPUs minimum (8GB recommended)
   - OS: Ubuntu 22.04 LTS
   - Add SSH key

2. **Connect and Deploy**
   ```bash
   # Copy infrastructure files to server
   scp -r infrastructure/ root@your-server-ip:/opt/comp-intel/
   
   # SSH into server
   ssh root@your-server-ip
   
   # Deploy application
   cd /opt/comp-intel/infrastructure
   ./deploy.sh --domain yourdomain.com --email you@email.com
   ```

3. **Configure DNS**
   - Point your domain A record to the droplet IP
   - Wait for DNS propagation (5-30 minutes)

4. **Access Application**
   - Frontend: `https://yourdomain.com`
   - API Docs: `https://yourdomain.com/docs`
   - Health Check: `https://yourdomain.com/health`

### Kubernetes Deployment

1. **Create DigitalOcean Kubernetes Cluster**
   - 3 nodes minimum (2GB RAM each)
   - Version 1.28+ recommended

2. **Configure kubectl**
   ```bash
   # Download cluster config
   doctl kubernetes cluster kubeconfig save your-cluster-name
   ```

3. **Deploy to Kubernetes**
   ```bash
   ./k8s/deploy-k8s.sh \
     --domain yourdomain.com \
     --email you@email.com \
     --registry registry.digitalocean.com/your-registry
   ```

## Configuration

### Environment Variables
Copy `.env.template` to `.env` and configure:

```bash
# Required
DOMAIN_NAME=yourdomain.com
EMAIL=you@email.com
POSTGRES_PASSWORD=secure_password_here

# Optional
ENABLE_MONITORING=false
RATE_LIMIT_API=100
RATE_LIMIT_WS=60
```

### SSL Certificates
- Automatically generated via Let's Encrypt
- Auto-renewal configured via cron
- Manual generation: `--skip-ssl` flag for testing

### Monitoring (Optional)
Includes Prometheus, Grafana, and alerting:

```bash
# Enable monitoring stack
./deploy.sh --enable-monitoring

# Access Grafana
https://yourdomain.com:3001
# Default login: admin / admin123
```

## Scaling and Performance

### Vertical Scaling (Single Server)
```bash
# Increase droplet size via DigitalOcean dashboard
# Services automatically use additional resources
```

### Horizontal Scaling (Kubernetes)
```bash
# Scale backend pods
kubectl scale deployment backend --replicas=5 -n comp-intel

# Auto-scaling is configured via HPA
# Scales between 2-10 replicas based on CPU/memory
```

### Performance Tuning
1. **Database Optimization**
   - Increase `shared_buffers` in PostgreSQL config
   - Add indexes for heavy queries
   - Enable connection pooling

2. **Cache Configuration**
   - Increase Redis memory limit
   - Configure Redis persistence vs. performance
   - Use Redis clustering for large datasets

3. **Application Tuning**
   - Adjust scraper intervals
   - Configure rate limiting
   - Enable gzip compression

## Monitoring and Maintenance

### Health Checks
- **Backend**: `GET /health`
- **Database**: Connection pool status
- **Redis**: Key expiration and memory usage
- **Scrapers**: Individual process health

### Log Management
```bash
# View logs (Docker Compose)
docker-compose logs -f backend

# View logs (Kubernetes)
kubectl logs -f deployment/backend -n comp-intel

# Log rotation configured automatically
```

### Backup Strategy
```bash
# Database backup (automated daily)
/opt/comp-intel/backup.sh

# Manual backup
docker exec postgres pg_dump -U postgres bullion_intel > backup.sql
```

### Updates and Maintenance
```bash
# Update application (Docker Compose)
git pull
docker-compose up -d --build

# Update application (Kubernetes)
./k8s/deploy-k8s.sh --domain yourdomain.com --email you@email.com --registry your-registry
```

## Troubleshooting

### Common Issues

1. **SSL Certificate Generation Failed**
   ```bash
   # Check DNS propagation
   dig yourdomain.com
   
   # Manual certificate generation
   certbot certonly --standalone -d yourdomain.com
   ```

2. **Services Not Starting**
   ```bash
   # Check logs
   docker-compose logs backend
   
   # Check resource usage
   htop
   df -h
   ```

3. **Database Connection Issues**
   ```bash
   # Test database connection
   docker exec -it postgres psql -U postgres -d bullion_intel
   
   # Check database logs
   docker-compose logs postgres
   ```

4. **High Memory Usage**
   ```bash
   # Check Redis memory
   docker exec redis redis-cli info memory
   
   # Restart services
   docker-compose restart
   ```

### Performance Issues

1. **Slow Response Times**
   - Check scraper process count
   - Monitor database query performance
   - Review Redis hit rates

2. **High CPU Usage**
   - Reduce scraper polling frequency
   - Scale horizontally (add more pods/containers)
   - Optimize database queries

### Support and Monitoring

1. **Application Metrics**
   - Response times: `/metrics` endpoint
   - Error rates: Application logs
   - Resource usage: System monitoring

2. **Alerting** (with monitoring enabled)
   - High CPU/memory usage
   - Service downtime
   - Database connection issues
   - SSL certificate expiration

## Security

### Best Practices
- Regular security updates
- Strong passwords (auto-generated)
- Firewall configuration (UFW)
- SSL/TLS encryption
- Rate limiting configured

### Network Security
- Internal service communication
- External access via HTTPS only
- Database not exposed externally
- Redis password protected

## Cost Optimization

### Single Server Costs
- **Basic**: $20/month (2GB RAM, 1 vCPU)
- **Recommended**: $40/month (4GB RAM, 2 vCPUs)
- **High Performance**: $80/month (8GB RAM, 4 vCPUs)

### Kubernetes Costs
- **Basic**: $60/month (3x 2GB nodes)
- **Recommended**: $120/month (3x 4GB nodes)
- **Production**: $200/month (5x 4GB nodes)

### Cost Reduction Tips
1. Use reserved instances for predictable workloads
2. Enable monitoring to identify resource waste
3. Configure auto-scaling to match demand
4. Regular cleanup of logs and backups
5. Use CDN for static assets (frontend)

## Migration Path

### From Development to Production
1. Start with single server deployment
2. Monitor usage and performance
3. Scale vertically (larger droplet) when needed
4. Migrate to Kubernetes for horizontal scaling
5. Add monitoring and alerting
6. Implement backup and disaster recovery

### Zero-Downtime Deployments
- Docker Compose: Rolling updates
- Kubernetes: Rolling deployments with readiness probes
- Blue-green deployments for critical updates
- Database migrations with backward compatibility