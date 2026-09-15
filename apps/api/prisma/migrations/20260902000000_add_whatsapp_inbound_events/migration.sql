CREATE TABLE `whatsapp_inbound_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `instance_id` VARCHAR(80) NOT NULL,
  `external_message_id` VARCHAR(191) NULL,
  `phone` VARCHAR(32) NULL,
  `event_type` VARCHAR(80) NULL,
  `message_type` VARCHAR(80) NULL,
  `action_id` VARCHAR(191) NULL,
  `fingerprint` VARCHAR(191) NULL,
  `payload` JSON NOT NULL,
  `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `whatsapp_inbound_events_public_id_key`(`public_id`),
  UNIQUE INDEX `whatsapp_inbound_events_fingerprint_key`(`tenant_id`, `fingerprint`),
  INDEX `whatsapp_inbound_events_tenant_id_received_at_idx`(`tenant_id`, `received_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `whatsapp_inbound_events`
  ADD CONSTRAINT `whatsapp_inbound_events_tenant_id_fkey`
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
