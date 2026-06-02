-- Onboarding analytics events table
CREATE TABLE IF NOT EXISTS onboarding_events (
    id VARCHAR PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    step VARCHAR(50) NOT NULL,
    event_type VARCHAR(20) NOT NULL,
    metadata JSONB,
    occurred_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_user_step ON onboarding_events (user_id, step);
CREATE INDEX IF NOT EXISTS idx_onboarding_occurred ON onboarding_events (occurred_at);
