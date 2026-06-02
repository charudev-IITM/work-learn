#!/bin/bash

echo "🔧 Setting up Bullion Competitive Intelligence Platform"

# Make scripts executable
chmod +x scripts/*.sh

echo "✅ Scripts made executable"

# Check system requirements
echo "🔍 Checking system requirements..."

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    echo "Please install Docker: https://docs.docker.com/get-docker/"
    exit 1
else
    echo "✅ Docker found: $(docker --version)"
fi

# Check docker-compose
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose is not installed"
    echo "Please install docker-compose: https://docs.docker.com/compose/install/"
    exit 1
else
    echo "✅ docker-compose found: $(docker-compose --version)"
fi

# Check Node.js (for local development)
if command -v node &> /dev/null; then
    echo "✅ Node.js found: $(node --version)"
else
    echo "⚠️  Node.js not found (needed for local frontend development)"
fi

# Check Python (for local development)
if command -v python3 &> /dev/null; then
    echo "✅ Python found: $(python3 --version)"
else
    echo "⚠️  Python3 not found (needed for local backend development)"
fi

echo ""
echo "🎯 Setup complete! Next steps:"
echo "1. Start development environment: ./scripts/start-dev.sh"
echo "2. Open browser to: http://localhost:3000"
echo ""
echo "📚 For more information, see README.md"