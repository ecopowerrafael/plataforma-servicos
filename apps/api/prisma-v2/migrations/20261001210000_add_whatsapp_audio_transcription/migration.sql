CREATE TABLE `tenant_whatsapp_audio_transcription` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `provider` VARCHAR(32) NOT NULL DEFAULT 'ASSEMBLYAI',
  `enabled` BOOLEAN NOT NULL DEFAULT false,
  `encrypted_api_key` TEXT NULL,
  `language_code` VARCHAR(16) NOT NULL DEFAULT 'pt',
  `max_audio_seconds` INT UNSIGNED NOT NULL DEFAULT 300,
  `last_validated_at` DATETIME(3) NULL,
  `last_validation_status` VARCHAR(32) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_whatsapp_audio_transcription_public_id_key` (`public_id`),
  UNIQUE KEY `tenant_whatsapp_audio_transcription_tenant_id_key` (`tenant_id`),
  CONSTRAINT `tenant_whatsapp_audio_transcription_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `whatsapp_inbound_events`
  ADD COLUMN `transcription_status` VARCHAR(16) NOT NULL DEFAULT 'NONE',
  ADD COLUMN `transcribed_text` TEXT NULL,
  ADD COLUMN `transcription_provider` VARCHAR(32) NULL,
  ADD COLUMN `transcription_duration_ms` INT UNSIGNED NULL,
  ADD COLUMN `transcription_completed_at` DATETIME(3) NULL,
  ADD COLUMN `transcription_external_id` VARCHAR(128) NULL;
