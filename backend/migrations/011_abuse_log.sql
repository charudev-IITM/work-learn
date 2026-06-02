-- Migration 011: Abuse event log for security monitoring
-- Records behavioral signals and scoring for admin visibility

CREATE TABLE IF NOT EXISTS abuse_events (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
    client_ip   VARCHAR(45) NOT NULL,
    cf_country  VARCHAR(2),
    is_datacenter BOOLEAN DEFAULT FALSE,
    provider    VARCHAR(50),
    signal      VARCHAR(100) NOT NULL,
    score_delta INTEGER NOT NULL,
    total_score INTEGER NOT NULL,
    path        VARCHAR(500),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_abuse_user ON abuse_events(user_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_abuse_ip ON abuse_events(client_ip, occurred_at);
