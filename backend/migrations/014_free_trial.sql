-- 014: Free trial promo system + platform settings
-- Adds trial columns to users and a key-value platform_settings table for feature flags.

-- Trial columns on users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS trial_ends_at    TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_users_trial_ends ON users(trial_ends_at)
  WHERE trial_ends_at IS NOT NULL;

-- Platform settings (feature flags / promo configuration)
CREATE TABLE IF NOT EXISTS platform_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Seed default settings
-- trial_promo_start/end: ISO datetime window when promo is active (empty = inactive)
-- trial_duration_days: how many days the trial lasts
-- preview_enabled: whether the 10-minute preview is available (shelved during promo)
INSERT INTO platform_settings (key, value, updated_at) VALUES
  ('trial_promo_start',   '2026-03-16T00:00:00Z', NOW()),
  ('trial_promo_end',     '2026-04-16T00:00:00Z', NOW()),
  ('trial_duration_days', '7', NOW()),
  ('preview_enabled',     'false', NOW())
ON CONFLICT (key) DO NOTHING;
