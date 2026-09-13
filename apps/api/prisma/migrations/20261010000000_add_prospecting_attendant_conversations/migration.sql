CREATE TABLE `prospecting_contacts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `normalized_phone` VARCHAR(20) NOT NULL,
  `display_name` VARCHAR(180) NULL,
  `first_inbound_at` DATETIME(3) NULL,
  `last_inbound_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `prospecting_contacts_public_id_key` (`public_id`),
  UNIQUE INDEX `prospecting_contacts_normalized_phone_key` (`normalized_phone`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `prospecting_conversations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `contact_id` BIGINT UNSIGNED NOT NULL,
  `instance_id` VARCHAR(100) NOT NULL,
  `status` ENUM('ACTIVE','MANUAL','CLOSED','SUPPRESSED') NOT NULL DEFAULT 'ACTIVE',
  `flow_id` BIGINT UNSIGNED NULL,
  `current_step_id` BIGINT UNSIGNED NULL,
  `lead_id` BIGINT UNSIGNED NULL,
  `campaign_id` BIGINT UNSIGNED NULL,
  `last_inbound_at` DATETIME(3) NULL,
  `last_outbound_at` DATETIME(3) NULL,
  `context` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `prospecting_conversations_public_id_key` (`public_id`),
  INDEX `prospecting_conversations_instance_status_idx` (`instance_id`, `status`),
  INDEX `prospecting_conversations_contact_status_idx` (`contact_id`, `status`),
  CONSTRAINT `prospecting_conversations_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `prospecting_contacts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `prospecting_whatsapp_configs`
  ADD COLUMN `attendant_enabled` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `attendant_flow_id` BIGINT UNSIGNED NULL,
  ADD COLUMN `greeting_message` TEXT NULL,
  ADD COLUMN `fallback_message` TEXT NULL,
  ADD COLUMN `media_fallback_message` TEXT NULL,
  ADD COLUMN `realtime_replies_enabled` BOOLEAN NOT NULL DEFAULT true;
