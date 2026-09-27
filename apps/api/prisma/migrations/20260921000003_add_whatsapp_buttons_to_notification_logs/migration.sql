-- Add WhatsApp buttons storage to NotificationLog
ALTER TABLE `notification_logs`
ADD COLUMN `whatsapp_buttons` JSON NULL AFTER `scheduled_at`;
