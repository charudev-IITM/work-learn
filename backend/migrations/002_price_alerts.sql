-- Price Alerts feature migration
-- Run once against existing database

CREATE TABLE IF NOT EXISTS price_alerts (
    id VARCHAR PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Target identification
    dealer_name VARCHAR(100) NOT NULL,
    script_name VARCHAR(200) NOT NULL,

    -- Alert configuration
    condition VARCHAR(10) NOT NULL CHECK (condition IN ('above', 'below')),
    rate_type VARCHAR(10) NOT NULL CHECK (rate_type IN ('buy', 'sell')),
    threshold FLOAT NOT NULL CHECK (threshold > 0),

    -- Lifecycle
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    trigger_mode VARCHAR(20) NOT NULL DEFAULT 'one_shot'
        CHECK (trigger_mode IN ('one_shot', 'persistent')),
    cooldown_minutes INTEGER NOT NULL DEFAULT 30
        CHECK (cooldown_minutes >= 5 AND cooldown_minutes <= 10080),

    -- Trigger tracking
    last_triggered_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Evaluation hot path: active alerts for a specific (dealer, script)
CREATE INDEX IF NOT EXISTS idx_alerts_dealer_script
    ON price_alerts (dealer_name, script_name);

-- CRUD queries: user's own alerts
CREATE INDEX IF NOT EXISTS idx_alerts_user_active
    ON price_alerts (user_id, is_active);
