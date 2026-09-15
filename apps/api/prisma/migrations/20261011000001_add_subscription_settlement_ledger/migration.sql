ALTER TABLE `commercial_manual_payments`
  MODIFY COLUMN `idempotency_key` VARCHAR(191) NOT NULL,
  ADD COLUMN `currency` CHAR(3) NOT NULL DEFAULT 'BRL',
  ADD COLUMN `payment_method` VARCHAR(32) NOT NULL DEFAULT 'CASH',
  ADD COLUMN `receiver_type` ENUM('REPRESENTATIVE', 'ADMINISTRATOR') NOT NULL DEFAULT 'REPRESENTATIVE',
  ADD COLUMN `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `reversal_of_id` BIGINT UNSIGNED NULL,
  ADD INDEX `commercial_manual_payments_reversal_of_id_idx` (`reversal_of_id`),
  ADD CONSTRAINT `commercial_manual_payments_reversal_of_id_fk` FOREIGN KEY (`reversal_of_id`) REFERENCES `commercial_manual_payments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `platform_ledger_entries` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NULL,
  `subscription_id` BIGINT UNSIGNED NULL,
  `manual_payment_id` BIGINT UNSIGNED NULL,
  `platform_charge_id` BIGINT UNSIGNED NULL,
  `amount_cents` BIGINT NOT NULL,
  `currency` CHAR(3) NOT NULL,
  `type` VARCHAR(32) NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `platform_ledger_entries_public_id_key` (`public_id`),
  INDEX `platform_ledger_entries_tenant_id_created_at_idx` (`tenant_id`, `created_at`),
  INDEX `platform_ledger_entries_subscription_id_created_at_idx` (`subscription_id`, `created_at`),
  INDEX `platform_ledger_entries_manual_payment_id_idx` (`manual_payment_id`),
  INDEX `platform_ledger_entries_platform_charge_id_type_idx` (`platform_charge_id`, `type`),
  CONSTRAINT `platform_ledger_entries_tenant_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `platform_ledger_entries_subscription_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `tenant_subscriptions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `platform_ledger_entries_manual_payment_id_fk` FOREIGN KEY (`manual_payment_id`) REFERENCES `commercial_manual_payments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `platform_ledger_entries_platform_charge_id_fk` FOREIGN KEY (`platform_charge_id`) REFERENCES `platform_subscription_charges`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
