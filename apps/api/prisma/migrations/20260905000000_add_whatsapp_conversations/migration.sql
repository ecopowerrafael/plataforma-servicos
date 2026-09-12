CREATE TABLE `whatsapp_conversations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `customer_id` BIGINT UNSIGNED NULL,
  `phone` VARCHAR(32) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  `current_flow` VARCHAR(48) NOT NULL DEFAULT 'MAIN_MENU',
  `current_step` VARCHAR(48) NULL,
  `context` JSON NULL,
  `last_inbound_at` DATETIME(3) NOT NULL,
  `last_outbound_at` DATETIME(3) NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `whatsapp_conversations_public_id_key`(`public_id`),
  INDEX `whatsapp_conversations_tenant_id_phone_status_idx`(`tenant_id`, `phone`, `status`),
  INDEX `whatsapp_conversations_tenant_id_last_inbound_at_idx`(`tenant_id`, `last_inbound_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `whatsapp_conversations`
  ADD CONSTRAINT `whatsapp_conversations_tenant_id_fkey`
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `whatsapp_conversations`
  ADD CONSTRAINT `whatsapp_conversations_customer_id_fkey`
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
