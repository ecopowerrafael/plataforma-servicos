-- Add WhatsApp configuration to NotificationTemplate
ALTER TABLE `notification_templates`
ADD COLUMN `whatsapp_buttons` JSON NULL AFTER `whatsapp_body`,
ADD COLUMN `whatsapp_enabled` BOOLEAN NOT NULL DEFAULT true AFTER `whatsapp_buttons`;
