-- Add WhatsApp assistant greeting and menu configuration
ALTER TABLE `tenant_whatsapp_configs` ADD COLUMN `assistant_config` JSON NULL;
