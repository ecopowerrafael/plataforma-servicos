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

ALTER TABLE `prospecting_messages`
  ADD COLUMN `conversation_id` BIGINT UNSIGNED NULL,
  ADD INDEX `prospecting_messages_conversation_id_created_at_idx` (`conversation_id`, `created_at`),
  ADD CONSTRAINT `prospecting_messages_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `prospecting_conversations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

INSERT IGNORE INTO `prospecting_contacts`
  (`public_id`, `normalized_phone`, `first_inbound_at`, `last_inbound_at`)
SELECT UUID(), `normalized_phone`, MIN(`created_at`), MAX(`last_inbound_at`)
FROM `prospecting_leads`
GROUP BY `normalized_phone`;

INSERT INTO `prospecting_conversations`
  (`public_id`, `contact_id`, `instance_id`, `status`, `lead_id`, `campaign_id`, `last_inbound_at`, `last_outbound_at`, `context`)
SELECT UUID(), c.id, 'legacy', 'ACTIVE', MIN(l.id), MIN(l.campaign_id), MAX(l.last_inbound_at), MAX(l.last_outbound_at), JSON_OBJECT('backfilled', true)
FROM `prospecting_contacts` c
JOIN `prospecting_leads` l ON l.normalized_phone = c.normalized_phone
GROUP BY c.id;

UPDATE `prospecting_messages` m
JOIN `prospecting_leads` l ON l.id = m.lead_id
JOIN `prospecting_contacts` c ON c.normalized_phone = l.normalized_phone
JOIN `prospecting_conversations` v ON v.contact_id = c.id
SET m.conversation_id = v.id
WHERE m.conversation_id IS NULL;
