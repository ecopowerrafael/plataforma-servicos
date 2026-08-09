CREATE TABLE `tenant_custom_field_definitions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `key` VARCHAR(63) NOT NULL,
  `label` VARCHAR(120) NOT NULL,
  `description` VARCHAR(500) NULL,
  `type` ENUM('TEXT', 'TEXTAREA', 'NUMBER', 'BOOLEAN', 'DATE', 'SELECT', 'MULTISELECT') NOT NULL,
  `scope` ENUM('TENANT', 'PROFESSIONAL', 'CUSTOMER', 'APPOINTMENT') NOT NULL,
  `required` BOOLEAN NOT NULL DEFAULT false,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `sort_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `options` JSON NULL,
  `validation` JSON NULL,
  `source` ENUM('PROFILE', 'OVERRIDE') NOT NULL DEFAULT 'OVERRIDE',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `tenant_custom_field_definitions_public_id_key`(`public_id`),
  UNIQUE INDEX `tenant_custom_field_definitions_tenant_id_scope_key`(`tenant_id`, `scope`, `key`),
  INDEX `tenant_custom_fields_lookup_idx`(`tenant_id`, `scope`, `active`, `sort_order`),
  PRIMARY KEY (`id`),
  CONSTRAINT `tenant_custom_field_definitions_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
