ALTER TABLE `tenant_whatsapp_configs`
  ADD COLUMN `last_validation_status` VARCHAR(32) NULL,
  ADD COLUMN `last_validated_at` DATETIME(3) NULL;

ALTER TABLE `notification_templates`
  ADD COLUMN `whatsapp_body` TEXT NULL;
