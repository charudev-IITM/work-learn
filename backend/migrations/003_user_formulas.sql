-- Calculator formulas feature migration
-- Run once against existing database

CREATE TABLE IF NOT EXISTS user_formulas (
    id VARCHAR PRIMARY KEY,
    user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    name VARCHAR(100) NOT NULL,
    description TEXT,
    ast JSONB NOT NULL,

    order_index INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_formula_name_nonempty CHECK (length(name) >= 1)
);

-- User's formulas ordered by position
CREATE INDEX IF NOT EXISTS idx_formulas_user_order
    ON user_formulas (user_id, order_index);
