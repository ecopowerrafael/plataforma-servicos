ALTER TABLE `whatsapp_inbound_events`
  ADD COLUMN `processing_started_at` DATETIME(3) NULL,
  ADD COLUMN `processing_token` VARCHAR(64) NULL,
  ADD COLUMN `processing_attempts` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN `processed_at` DATETIME(3) NULL,
  ADD INDEX `whatsapp_inbound_events_processing_idx` (`tenant_id`, `processed_at`, `processing_started_at`);
