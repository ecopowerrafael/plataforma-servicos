CREATE TABLE `whatsapp_outbound_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `instance_id` VARCHAR(80) NOT NULL,
  `phone` VARCHAR(32) NOT NULL,
  `external_message_id` VARCHAR(191) NULL,
  `action_ids` JSON NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `sent_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `whatsapp_outbound_messages_public_id_key`(`public_id`),
  INDEX `whatsapp_outbound_messages_tenant_id_external_message_id_idx`(`tenant_id`, `external_message_id`),
  INDEX `whatsapp_outbound_messages_tenant_id_sent_at_idx`(`tenant_id`, `sent_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `whatsapp_outbound_messages`
  ADD CONSTRAINT `whatsapp_outbound_messages_tenant_id_fkey`
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
