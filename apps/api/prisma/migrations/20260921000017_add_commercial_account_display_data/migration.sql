-- Add display name and phone to commercial accounts
ALTER TABLE commercial_accounts
ADD COLUMN display_name VARCHAR(255) NULL AFTER user_id,
ADD COLUMN phone VARCHAR(32) NULL AFTER display_name;

-- Index for potential lookups
CREATE INDEX idx_commercial_accounts_display_name ON commercial_accounts(display_name);
