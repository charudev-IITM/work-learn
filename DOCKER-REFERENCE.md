# Docker Configuration Reference

This document provides a clear reference for all Docker-related files in the repository and their intended usage.

## 🚀 Development Environment

### Primary Files
- **`docker-compose.dev.yml`** - Development environment with hot reload
- **`scripts/start-dev.sh`** - Starts development environment
- **`scripts/stop-dev.sh`** - Stops development environment

### Dockerfiles Used
- **`docker/Dockerfile.backend.dev`** - Backend development container
- **`docker/Dockerfile.frontend.dev`** - Frontend development container

### Features
- ✅ Hot reload for both backend and frontend
- ✅ Code mounted as volumes for live changes
- ✅ Development-friendly logging and debugging
- ✅ Access: Frontend (http://localhost:3000), Backend (http://localhost:8000)

## 🌐 Production Environment

### Primary Files
- **`infrastructure/docker-compose.prod.yml`** - Full production deployment
- **`infrastructure/deploy.sh`** - Production deployment script

### Dockerfiles Used
- **`docker/Dockerfile.backend`** - Production backend container
- **`docker/Dockerfile.frontend`** - Production frontend container

### Features
- ✅ Nginx reverse proxy with SSL termination
- ✅ Let's Encrypt certificate management
- ✅ Redis and PostgreSQL with optimized settings
- ✅ Health checks and monitoring
- ✅ Log aggregation and watchtower updates
- ✅ Resource optimization and security hardening

## 📊 Monitoring Stack (Optional)

### Files
- **`infrastructure/monitoring/docker-compose.monitoring.yml`** - Complete monitoring setup

### Components
- **Prometheus** - Metrics collection (port 9090)
- **Grafana** - Visualization dashboard (port 3001)
- **AlertManager** - Alert management (port 9093)
- **Loki + Promtail** - Log aggregation (port 3100)
- **Node Exporter** - System metrics (port 9100)
- **cAdvisor** - Container metrics (port 8080)
- **Database Exporters** - Redis and PostgreSQL metrics

## 🛠️ Usage Commands

### Development
```bash
# Start development environment
./scripts/start-dev.sh

# Stop development environment
./scripts/stop-dev.sh

# View logs
docker-compose -f docker-compose.dev.yml logs -f
```

### Production
```bash
# Initial deployment
sudo ./infrastructure/deploy.sh -d your-domain.com -e your-email@domain.com

# Quick update (preserves Docker cache)
sudo ./infrastructure/deploy.sh -d your-domain.com --quick

# Enable monitoring
sudo ./infrastructure/deploy.sh -d your-domain.com --enable-monitoring
```

### Monitoring
```bash
# Start monitoring stack
docker-compose -f infrastructure/monitoring/docker-compose.monitoring.yml up -d

# View monitoring services
docker-compose -f infrastructure/monitoring/docker-compose.monitoring.yml ps
```

## 🗂️ File Structure Summary

```
./
├── docker-compose.dev.yml              # Development environment
├── docker/
│   ├── Dockerfile.backend              # Production backend
│   ├── Dockerfile.backend.dev          # Development backend  
│   ├── Dockerfile.frontend             # Production frontend
│   └── Dockerfile.frontend.dev         # Development frontend
├── infrastructure/
│   ├── docker-compose.prod.yml         # Production environment
│   ├── deploy.sh                       # Production deployment
│   └── monitoring/
│       └── docker-compose.monitoring.yml # Monitoring stack
└── scripts/
    ├── start-dev.sh                    # Start development
    └── stop-dev.sh                     # Stop development
```

## 🚫 Removed Files (Cleanup)

The following duplicate/unused files were removed for clarity:
- ~~`docker-compose.yml`~~ - Unused root compose file
- ~~`docker-compose.prod.yml`~~ - Duplicate production config (older)
- ~~`docker/Dockerfile.backend.prod`~~ - Unused production backend
- ~~`docker/Dockerfile.frontend.prod`~~ - Unused production frontend

## 💡 Best Practices

1. **Development**: Always use `docker-compose.dev.yml` for local development
2. **Production**: Use the infrastructure deployment script for production
3. **Monitoring**: Enable monitoring stack for production environments
4. **Updates**: Use `--quick` flag for faster deployments when only code changes
5. **Security**: Production uses SSL/TLS, secure database passwords, and hardened containers

---

*Last updated: $(date '+%Y-%m-%d')*
*Maintainer: Principal Engineering Team*