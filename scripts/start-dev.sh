
#!/bin/bash

echo "🚀 Starting Bullion Competitive Intelligence Platform in Development Mode"

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose is not installed. Please install it and try again."
    exit 1
fi

echo "📦 Building and starting services with hot reload..."
docker-compose -f docker-compose.dev.yml up -d --build

echo "⏳ Waiting for services to be ready..."
sleep 15

# Check if services are running
echo "🔍 Checking service status..."
docker-compose -f docker-compose.dev.yml ps

echo "✅ Services started successfully!"
echo ""
echo "📱 Access the application:"
echo "   Frontend: http://localhost:3000"
echo "   Backend API: http://localhost:8000"
echo "   API Documentation: http://localhost:8000/docs"
echo "   Database: postgresql://postgres:password@localhost:5432/bullion_intel"
echo "   Redis: redis://localhost:6379"
echo ""
echo "📊 To view logs:"
echo "   All services: docker-compose -f docker-compose.dev.yml logs -f"
echo "   Backend only: docker-compose -f docker-compose.dev.yml logs -f backend"
echo "   Frontend only: docker-compose -f docker-compose.dev.yml logs -f frontend"
echo ""
echo "🛑 To stop services: docker-compose -f docker-compose.dev.yml down"
echo "♻️  Hot reload enabled: Changes to code will automatically trigger rebuilds!"
echo ""
echo "Happy trading! 📈"