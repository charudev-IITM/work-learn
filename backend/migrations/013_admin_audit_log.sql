-- Admin audit log table
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    admin_user_id TEXT NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    target_user_id TEXT,
    details JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_admin ON admin_audit_log(admin_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON admin_audit_log(action, created_at);
