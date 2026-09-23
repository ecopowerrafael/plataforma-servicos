CREATE TABLE `commercial_remittances` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `commercial_account_id` BIGINT UNSIGNED NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `amount_cents` BIGINT UNSIGNED NOT NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'BRL',
  `payment_method` VARCHAR(32) NOT NULL,
  `proof_reference` VARCHAR(255) NULL,
  `status` ENUM('PENDING','CONFIRMED','CANCELED') NOT NULL DEFAULT 'PENDING',
  `confirmed_by_user_id` BIGINT UNSIGNED NULL,
  `confirmed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `commercial_remittances_public_id_key` (`public_id`),
  INDEX `commercial_remittances_account_status_created_idx` (`commercial_account_id`,`status`,`created_at`),
  INDEX `commercial_remittances_tenant_status_created_idx` (`tenant_id`,`status`,`created_at`),
  CONSTRAINT `commercial_remittances_account_fk` FOREIGN KEY (`commercial_account_id`) REFERENCES `commercial_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `commercial_remittances_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `commercial_remittances_user_fk` FOREIGN KEY (`confirmed_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `commercial_wallet_entries`
  ADD COLUMN `remittance_id` BIGINT UNSIGNED NULL,
  ADD INDEX `commercial_wallet_entries_remittance_id_idx` (`remittance_id`),
  ADD CONSTRAINT `commercial_wallet_entries_remittance_id_fk` FOREIGN KEY (`remittance_id`) REFERENCES `commercial_remittances`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `commercial_remittance_allocations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `remittance_id` BIGINT UNSIGNED NOT NULL,
  `manual_payment_id` BIGINT UNSIGNED NOT NULL,
  `amount_cents` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `commercial_remittance_allocations_pair_key` (`remittance_id`,`manual_payment_id`),
  INDEX `commercial_remittance_allocations_payment_idx` (`manual_payment_id`),
  CONSTRAINT `commercial_remittance_allocations_remittance_fk` FOREIGN KEY (`remittance_id`) REFERENCES `commercial_remittances`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `commercial_remittance_allocations_payment_fk` FOREIGN KEY (`manual_payment_id`) REFERENCES `commercial_manual_payments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
