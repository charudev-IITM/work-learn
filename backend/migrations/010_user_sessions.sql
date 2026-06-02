-- Migration 010: User sessions table for session management
-- Tracks active sessions per user, enables single-session enforcement

CREATE TABLE IF NOT EXISTS user_sessions (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    jti             TEXT NOT NULL UNIQUE,
    user_agent      TEXT,
    ip_address      VARCHAR(45),
    device_hint     VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at      TIMESTAMPTZ,
    revoke_reason   VARCHAR(50)  -- 'logout' | 'new_login' | 'admin'
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON user_sessions(user_id) WHERE revoked_at IS NULL;
