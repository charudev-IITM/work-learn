#!/bin/bash

echo "🛑 Stopping Bullion Competitive Intelligence Platform"

# Stop all services
docker-compose -f docker-compose.dev.yml down

echo "🧹 Cleaning up..."

# Optional: Remove volumes (uncomment if you want to reset data)
# echo "⚠️  Removing volumes (this will delete all data)..."
# docker-compose down -v

echo "✅ All services stopped successfully!"
echo ""
echo "💡 To start again: ./scripts/start-dev.sh"
echo "🗑️  To remove all data: docker-compose -f docker-compose.dev.yml down -v"