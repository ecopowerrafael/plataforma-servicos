CREATE TABLE `service_categories` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `description` VARCHAR(500) NULL,
  `color` CHAR(7) NOT NULL,
  `icon` VARCHAR(64) NULL,
  `sort_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `service_categories_public_id_key` (`public_id`),
  UNIQUE INDEX `service_categories_tenant_id_name_key` (`tenant_id`, `name`),
  INDEX `service_categories_tenant_id_active_sort_order_idx` (`tenant_id`, `active`, `sort_order`),
  CONSTRAINT `service_categories_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `services`
  ADD COLUMN `category_id` BIGINT UNSIGNED NULL,
  ADD INDEX `services_tenant_id_category_id_idx` (`tenant_id`, `category_id`),
  ADD CONSTRAINT `services_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `service_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
