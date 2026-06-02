-- Create database and tables for comp-intel

-- Create users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    is_admin BOOLEAN DEFAULT false,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on username for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Create watchlists table for user-specific watchlists
CREATE TABLE IF NOT EXISTS watchlists (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    competitor_names TEXT[] NOT NULL DEFAULT '{}',
    view_mode VARCHAR(20) DEFAULT 'table',
    sort_mode VARCHAR(20) DEFAULT 'name',
    differences_enabled BOOLEAN DEFAULT false,
    reference_competitor VARCHAR(100),
    reference_script VARCHAR(100),
    reference_type VARCHAR(10) DEFAULT 'buy',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
);

-- Create indexes on watchlists
CREATE INDEX IF NOT EXISTS idx_watchlists_user_id ON watchlists(user_id);

-- Create competitors table
CREATE TABLE IF NOT EXISTS competitors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    base_url VARCHAR(500),
    scraper_type VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create rate_records table
CREATE TABLE IF NOT EXISTS rate_records (
    id SERIAL PRIMARY KEY,
    competitor_id INTEGER REFERENCES competitors(id),
    competitor_name VARCHAR(100) NOT NULL,
    product_type VARCHAR(50) NOT NULL,
    buy_rate DECIMAL(10,2),
    sell_rate DECIMAL(10,2),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    raw_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_rate_records_competitor_timestamp ON rate_records(competitor_name, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_rate_records_timestamp ON rate_records(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_rate_records_product_type ON rate_records(product_type);

-- Insert default competitors
INSERT INTO competitors (name, display_name, scraper_type, is_active) 
VALUES 
    ('kjbullion', 'KJ Bullion', 'API', true),
    ('csvbullion', 'CSV Bullion', 'WebSocket', true),
    ('rsbl', 'RSBL', 'Firebase', true),
    ('arihantspot', 'Arihant Spot Exchange', 'API', true),
    ('dpgold', 'DP Gold', 'API', true),
    ('slnbullion', 'SLN Bullion', 'API', true),
    ('amsbullion', 'AMS Bullion', 'API', true),
    ('suswanibullion', 'Suswani Bullion', 'API', true),
    ('smsbullion', 'SMS Bullion', 'API', true),
    ('ashtasiddhi', 'Ashta Siddhi', 'API', true),
    ('rakshabullion', 'Raksha Bullion', 'API', true),
    ('shivsahai', 'Shiv Sahai', 'API', true)
ON CONFLICT (name) DO NOTHING;