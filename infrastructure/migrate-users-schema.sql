-- Migration script to add missing columns to users table
-- Run this on production database to fix schema mismatch

-- Add missing columns to existing users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;

-- Update existing users to have is_active = true
UPDATE users SET is_active = true WHERE is_active IS NULL;

-- Verify the changes
\d users;