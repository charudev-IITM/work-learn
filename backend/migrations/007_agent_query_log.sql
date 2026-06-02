-- Goldie AI Agent: query logging for analytics and cost tracking
CREATE TABLE IF NOT EXISTS agent_query_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    message TEXT NOT NULL,
    response_summary TEXT,
    tools_called JSONB,
    credits_used INTEGER NOT NULL DEFAULT 1,
    latency_ms INTEGER,
    error TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_logs_user ON agent_query_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_logs_session ON agent_query_logs(session_id);
