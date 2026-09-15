CREATE TABLE IF NOT EXISTS `platform_payment_configs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `public_id` CHAR(36) NOT NULL,
  `provider` VARCHAR(64) NOT NULL, `active` BOOLEAN NOT NULL DEFAULT false,
  `environment` ENUM('SANDBOX','PRODUCTION') NOT NULL DEFAULT 'SANDBOX',
  `credentials_ciphertext` TEXT NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`), UNIQUE KEY `platform_payment_configs_public_id_key` (`public_id`),
  UNIQUE KEY `platform_payment_configs_provider_key` (`provider`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `platform_subscription_charges` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `public_id` CHAR(36) NOT NULL,
  `subscription_id` BIGINT UNSIGNED NOT NULL, `provider` VARCHAR(64) NOT NULL,
  `environment` ENUM('SANDBOX','PRODUCTION') NOT NULL, `external_id` VARCHAR(191) NULL,
  `status` ENUM('PENDING','PROCESSING','PAID','FAILED','CANCELED','EXPIRED','REFUNDED') NOT NULL DEFAULT 'PENDING',
  `amount_cents` BIGINT UNSIGNED NOT NULL, `currency` CHAR(3) NOT NULL,
  `idempotency_key` VARCHAR(191) NOT NULL, `pix_copy_paste` TEXT NULL, `paid_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`), UNIQUE KEY `platform_subscription_charges_public_id_key` (`public_id`),
  UNIQUE KEY `platform_subscription_charges_idempotency_key_key` (`idempotency_key`),
  UNIQUE KEY `platform_subscription_charges_provider_external_id_key` (`provider`,`external_id`),
  KEY `platform_subscription_charges_subscription_id_created_at_idx` (`subscription_id`,`created_at`),
  KEY `platform_subscription_charges_status_created_at_idx` (`status`,`created_at`),
  CONSTRAINT `platform_subscription_charges_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `tenant_subscriptions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
