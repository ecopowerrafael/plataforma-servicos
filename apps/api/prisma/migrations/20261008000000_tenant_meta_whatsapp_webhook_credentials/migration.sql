ALTER TABLE `tenant_whatsapp_configs`
  ADD COLUMN `encrypted_app_secret` TEXT NULL,
  ADD COLUMN `encrypted_verify_token` TEXT NULL,
  ADD COLUMN `webhook_public_id` CHAR(36) NULL,
  ADD UNIQUE INDEX `tenant_whatsapp_configs_webhook_public_id_key` (`webhook_public_id`);
