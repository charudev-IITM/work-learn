-- Add layout_mode and city_filter to user_settings

ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS layout_mode VARCHAR(20) NOT NULL DEFAULT 'compact';

ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS city_filter VARCHAR(100);
