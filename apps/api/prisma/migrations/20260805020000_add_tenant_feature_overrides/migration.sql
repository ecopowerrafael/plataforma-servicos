CREATE TABLE `tenant_feature_overrides` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `feature_code` VARCHAR(64) NOT NULL,
  `enabled` BOOLEAN NOT NULL,
  `source` ENUM('PROFILE', 'OVERRIDE') NOT NULL DEFAULT 'OVERRIDE',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `tenant_feature_overrides_tenant_id_feature_code_key`(`tenant_id`, `feature_code`),
  INDEX `tenant_feature_overrides_tenant_id_source_idx`(`tenant_id`, `source`),
  PRIMARY KEY (`id`),
  CONSTRAINT `tenant_feature_overrides_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
