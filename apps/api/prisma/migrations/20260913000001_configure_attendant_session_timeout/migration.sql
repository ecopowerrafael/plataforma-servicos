ALTER TABLE `prospecting_whatsapp_configs`
  ADD COLUMN `attendant_session_timeout_enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN `attendant_session_timeout_minutes` INT UNSIGNED NOT NULL DEFAULT 60;
