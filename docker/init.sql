-- Initialize the database schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create competitors table
CREATE TABLE IF NOT EXISTS competitors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    base_url VARCHAR(500) NOT NULL,
    scraper_type VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create scripts table
CREATE TABLE IF NOT EXISTS scripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    competitor_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    symbol VARCHAR(100) NOT NULL,
    category VARCHAR(50) DEFAULT 'gold',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(competitor_id, symbol)
);

-- Create rates table (partitioned by date for performance)
CREATE TABLE IF NOT EXISTS rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    script_id UUID NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    buy_rate DECIMAL(10,2),
    sell_rate DECIMAL(10,2),
    high_rate DECIMAL(10,2),
    low_rate DECIMAL(10,2),
    volume BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    is_admin BOOLEAN DEFAULT false,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create user_dashboards table for saving user configurations
CREATE TABLE IF NOT EXISTS user_dashboards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    config JSONB NOT NULL,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_rates_script_timestamp ON rates(script_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_rates_timestamp ON rates(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_scripts_competitor ON scripts(competitor_id);
CREATE INDEX IF NOT EXISTS idx_user_dashboards_user ON user_dashboards(user_id);

-- Insert sample competitors
INSERT INTO competitors (name, base_url, scraper_type) VALUES
    ('kjbullion', 'https://kjbullion.com/', 'api'),
    ('arihantspot', 'https://www.arihantspot.in/', 'api'),
    ('dpgold', 'https://dpgold.com/', 'api'),
    ('slnbullion', 'https://slnbullion.com/', 'api'),
    ('amsbullion', 'https://amsbullion.com/', 'api'),
    ('suswanibullion', 'http://www.suswanibullion.com/', 'api'),
    ('smsbullion', 'https://www.smsbullion.com/', 'api'),
    ('ashtasiddhi', 'https://ashtasiddhi.co.in/', 'api'),
    ('rakshabullion', 'https://rakshabullion.com/', 'api'),
    ('shivsahai', 'http://www.shivsahai.com/', 'api'),
    ('csvbullion', 'https://csvbullion.com/', 'websocket')
ON CONFLICT (name) DO NOTHING;

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_competitors_updated_at BEFORE UPDATE ON competitors FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_scripts_updated_at BEFORE UPDATE ON scripts FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_user_dashboards_updated_at BEFORE UPDATE ON user_dashboards FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();