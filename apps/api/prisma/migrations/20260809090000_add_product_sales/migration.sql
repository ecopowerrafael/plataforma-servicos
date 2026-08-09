ALTER TABLE `products`
  ADD COLUMN `commission_type` ENUM('PERCENTAGE','FIXED') NULL,
  ADD COLUMN `commission_value` INTEGER UNSIGNED NULL;

CREATE TABLE `product_sales` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL, `unit_id` BIGINT UNSIGNED NOT NULL,
  `customer_id` BIGINT UNSIGNED NULL, `professional_id` BIGINT UNSIGNED NULL,
  `payment_method_id` BIGINT UNSIGNED NOT NULL, `cash_movement_id` BIGINT UNSIGNED NULL,
  `total_cents` BIGINT UNSIGNED NOT NULL, `notes` VARCHAR(500) NULL,
  `user_id` BIGINT UNSIGNED NOT NULL, `session_id` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`), UNIQUE INDEX `product_sales_public_id_key` (`public_id`),
  UNIQUE INDEX `product_sales_cash_movement_id_key` (`cash_movement_id`),
  INDEX `product_sales_tenant_unit_created_idx` (`tenant_id`,`unit_id`,`created_at`),
  INDEX `product_sales_tenant_customer_created_idx` (`tenant_id`,`customer_id`,`created_at`),
  INDEX `product_sales_tenant_professional_created_idx` (`tenant_id`,`professional_id`,`created_at`),
  CONSTRAINT `product_sales_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `product_sales_unit_fk` FOREIGN KEY (`unit_id`) REFERENCES `business_units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `product_sales_customer_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `product_sales_professional_fk` FOREIGN KEY (`professional_id`) REFERENCES `professionals`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `product_sales_payment_method_fk` FOREIGN KEY (`payment_method_id`) REFERENCES `payment_methods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `product_sales_cash_movement_fk` FOREIGN KEY (`cash_movement_id`) REFERENCES `cash_movements`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `product_sales_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `product_sales_session_fk` FOREIGN KEY (`session_id`) REFERENCES `user_sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `product_sale_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL, `sale_id` BIGINT UNSIGNED NOT NULL,
  `product_id` BIGINT UNSIGNED NOT NULL, `quantity` INTEGER UNSIGNED NOT NULL,
  `unit_price_cents` BIGINT UNSIGNED NOT NULL, `total_cents` BIGINT UNSIGNED NOT NULL,
  `commission_type` ENUM('PERCENTAGE','FIXED') NULL, `commission_value` INTEGER UNSIGNED NULL,
  `commission_amount_cents` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `stock_movement_id` BIGINT UNSIGNED NOT NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`), UNIQUE INDEX `product_sale_items_public_id_key` (`public_id`),
  UNIQUE INDEX `product_sale_items_stock_movement_id_key` (`stock_movement_id`),
  INDEX `product_sale_items_tenant_product_created_idx` (`tenant_id`,`product_id`,`created_at`),
  CONSTRAINT `product_sale_items_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `product_sale_items_sale_fk` FOREIGN KEY (`sale_id`) REFERENCES `product_sales`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `product_sale_items_product_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `product_sale_items_stock_movement_fk` FOREIGN KEY (`stock_movement_id`) REFERENCES `stock_movements`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
