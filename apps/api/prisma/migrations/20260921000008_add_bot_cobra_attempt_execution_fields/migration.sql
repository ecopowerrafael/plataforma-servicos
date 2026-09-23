-- Fase 4 do Bot Cobra: campos técnicos para execução real do envio via WhatsApp.
ALTER TABLE `collection_attempts`
  ADD COLUMN `processing_at` DATETIME(3) NULL,
  ADD COLUMN `provider_message_id` VARCHAR(100) NULL,
  ADD COLUMN `technical_retry_count` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN `next_retry_at` DATETIME(3) NULL,
  ADD COLUMN `last_error` VARCHAR(500) NULL;
