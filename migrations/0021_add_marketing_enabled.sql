-- Add marketing_enabled column to notification_settings
ALTER TABLE notification_settings ADD COLUMN marketing_enabled INTEGER DEFAULT 0;

-- Create index for marketing enabled users (for targeted campaigns)
CREATE INDEX IF NOT EXISTS idx_notification_settings_marketing ON notification_settings(marketing_enabled);
