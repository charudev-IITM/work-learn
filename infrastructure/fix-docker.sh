#!/bin/bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_status "Fixing Docker installation conflicts..."

# Remove conflicting packages
print_status "Removing conflicting containerd packages..."
apt remove -y containerd containerd.io docker.io docker-doc docker-compose podman-docker || true
apt autoremove -y

# Clean up any leftover Docker files
print_status "Cleaning up Docker remnants..."
rm -rf /var/lib/docker
rm -rf /var/lib/containerd

# Update package lists
print_status "Updating package lists..."
apt update

# Install Docker using the official method
print_status "Installing Docker from official repository..."

# Add Docker's official GPG key
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

# Update package lists again
apt update

# Install Docker Engine
print_status "Installing Docker Engine..."
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start and enable Docker
systemctl start docker
systemctl enable docker

# Test Docker installation
print_status "Testing Docker installation..."
if docker run hello-world > /dev/null 2>&1; then
    print_success "Docker installed successfully!"
else
    print_error "Docker installation failed"
    exit 1
fi

# Install docker-compose (standalone)
print_status "Installing docker-compose..."
DOCKER_COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep 'tag_name' | cut -d\" -f4)
curl -L "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Verify docker-compose installation
if docker-compose --version > /dev/null 2>&1; then
    print_success "docker-compose installed successfully!"
else
    print_error "docker-compose installation failed"
    exit 1
fi

print_success "Docker setup completed successfully!"
print_status "Docker version: $(docker --version)"
print_status "Docker Compose version: $(docker-compose --version)"