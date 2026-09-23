CREATE TABLE `stripe_plan_catalogs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `plan_id` BIGINT UNSIGNED NOT NULL,
  `environment` ENUM('SANDBOX','PRODUCTION') NOT NULL,
  `stripe_product_id` VARCHAR(191) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  `last_error` TEXT NULL,
  `last_synced_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `stripe_plan_catalogs_public_id_key` (`public_id`),
  UNIQUE INDEX `stripe_plan_catalogs_plan_id_environment_key` (`plan_id`,`environment`),
  UNIQUE INDEX `stripe_plan_catalogs_environment_stripe_product_id_key` (`environment`,`stripe_product_id`),
  INDEX `stripe_plan_catalogs_status_environment_idx` (`status`,`environment`),
  PRIMARY KEY (`id`),
  CONSTRAINT `stripe_plan_catalogs_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `commercial_plans` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `stripe_plan_prices` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `catalog_id` BIGINT UNSIGNED NOT NULL,
  `billing_option_id` BIGINT UNSIGNED NOT NULL,
  `stripe_price_id` VARCHAR(191) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'SYNCED',
  `amount_cents` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `stripe_plan_prices_public_id_key` (`public_id`),
  UNIQUE INDEX `stripe_plan_prices_catalog_id_billing_option_id_key` (`catalog_id`,`billing_option_id`),
  UNIQUE INDEX `stripe_plan_prices_stripe_price_id_key` (`stripe_price_id`),
  INDEX `stripe_plan_prices_billing_option_id_status_idx` (`billing_option_id`,`status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `stripe_plan_prices_catalog_id_fkey` FOREIGN KEY (`catalog_id`) REFERENCES `stripe_plan_catalogs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `stripe_plan_prices_billing_option_id_fkey` FOREIGN KEY (`billing_option_id`) REFERENCES `plan_billing_options` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
