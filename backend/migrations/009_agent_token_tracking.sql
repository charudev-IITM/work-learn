-- Token tracking for Goldie agent queries
-- Supports token-weighted credit deduction (1 credit = N tokens)

ALTER TABLE agent_query_logs
    ALTER COLUMN credits_used TYPE FLOAT USING credits_used::float;

ALTER TABLE agent_query_logs
    ADD COLUMN IF NOT EXISTS input_tokens INTEGER,
    ADD COLUMN IF NOT EXISTS output_tokens INTEGER,
    ADD COLUMN IF NOT EXISTS total_tokens INTEGER;

CREATE INDEX IF NOT EXISTS idx_agent_logs_tokens
    ON agent_query_logs(user_id, total_tokens)
    WHERE total_tokens IS NOT NULL;
