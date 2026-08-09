CREATE TABLE `customers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `public_id` CHAR(36) NOT NULL, `tenant_id` BIGINT UNSIGNED NOT NULL, `primary_unit_id` BIGINT UNSIGNED NULL,
  `name` VARCHAR(120) NOT NULL, `social_name` VARCHAR(120) NULL, `phone` VARCHAR(32) NULL, `whatsapp` VARCHAR(32) NULL, `email` VARCHAR(254) NULL,
  `birth_date` DATE NULL, `document` VARCHAR(80) NULL, `notes` VARCHAR(2000) NULL, `status` ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `source` VARCHAR(64) NOT NULL DEFAULT 'MANUAL', `accepts_communications` BOOLEAN NOT NULL DEFAULT FALSE, `custom_fields` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`), UNIQUE INDEX `customers_public_id_key` (`public_id`), UNIQUE INDEX `customers_tenant_phone_key` (`tenant_id`,`phone`), UNIQUE INDEX `customers_tenant_email_key` (`tenant_id`,`email`),
  INDEX `customers_tenant_status_name_idx` (`tenant_id`,`status`,`name`), INDEX `customers_tenant_primary_unit_idx` (`tenant_id`,`primary_unit_id`),
  CONSTRAINT `customers_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customers_primary_unit_id_fkey` FOREIGN KEY (`primary_unit_id`) REFERENCES `business_units`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
