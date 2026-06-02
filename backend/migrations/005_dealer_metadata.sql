-- Dealer metadata: logo, name, city, address, emails, phones, whatsapp, etc.
CREATE TABLE IF NOT EXISTS dealer_metadata (
    dealer_id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(200),
    website VARCHAR(500),
    logo_url TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    address TEXT,
    emails JSONB NOT NULL DEFAULT '[]'::jsonb,
    phones JSONB NOT NULL DEFAULT '[]'::jsonb,
    whatsapp VARCHAR(20),
    social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
    scraped_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dealer_metadata_city ON dealer_metadata(city);
CREATE INDEX IF NOT EXISTS idx_dealer_metadata_state ON dealer_metadata(state);
