-- Initialize bullion intelligence database
-- This script sets up optimizations for the database

-- Create database if it doesn't exist (handled by Docker environment)

-- Enable extensions for better performance
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Set optimal PostgreSQL settings for our use case
-- These will be session-specific in development
SET shared_preload_libraries = 'pg_stat_statements';
SET track_activities = on;
SET track_counts = on;
SET track_io_timing = on;

-- Create indexes after table creation (will be handled by SQLAlchemy migrations)
-- But we can add some additional performance indexes here when needed