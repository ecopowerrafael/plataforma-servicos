CREATE TABLE `product_categories` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL, `name` VARCHAR(120) NOT NULL,
  `description` VARCHAR(500) NULL, `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`),
  UNIQUE INDEX `product_categories_public_id_key` (`public_id`),
  UNIQUE INDEX `product_categories_tenant_id_name_key` (`tenant_id`, `name`),
  INDEX `product_categories_tenant_id_active_name_idx` (`tenant_id`, `active`, `name`),
  CONSTRAINT `product_categories_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `products` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL, `category_id` BIGINT UNSIGNED NULL,
  `name` VARCHAR(160) NOT NULL, `description` VARCHAR(1000) NULL,
  `sku` VARCHAR(80) NULL, `barcode` VARCHAR(80) NULL,
  `cost_price_cents` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `sale_price_cents` BIGINT UNSIGNED NOT NULL, `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`),
  UNIQUE INDEX `products_public_id_key` (`public_id`),
  UNIQUE INDEX `products_tenant_id_name_key` (`tenant_id`, `name`),
  UNIQUE INDEX `products_tenant_id_sku_key` (`tenant_id`, `sku`),
  UNIQUE INDEX `products_tenant_id_barcode_key` (`tenant_id`, `barcode`),
  INDEX `products_tenant_id_active_name_idx` (`tenant_id`, `active`, `name`),
  INDEX `products_tenant_id_category_id_idx` (`tenant_id`, `category_id`),
  CONSTRAINT `products_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `products_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `product_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `product_stocks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL, `product_id` BIGINT UNSIGNED NOT NULL,
  `business_unit_id` BIGINT UNSIGNED NOT NULL, `quantity` INT UNSIGNED NOT NULL DEFAULT 0,
  `minimum_quantity` INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`),
  UNIQUE INDEX `product_stocks_public_id_key` (`public_id`),
  UNIQUE INDEX `product_stocks_product_id_business_unit_id_key` (`product_id`, `business_unit_id`),
  INDEX `product_stocks_tenant_id_business_unit_id_idx` (`tenant_id`, `business_unit_id`),
  INDEX `product_stocks_tenant_id_product_id_idx` (`tenant_id`, `product_id`),
  CONSTRAINT `product_stocks_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `product_stocks_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `product_stocks_business_unit_id_fkey` FOREIGN KEY (`business_unit_id`) REFERENCES `business_units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
