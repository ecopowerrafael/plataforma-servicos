CREATE TABLE `tenant_whatsapp_meta_templates` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `whatsapp_config_id` BIGINT UNSIGNED NOT NULL,
  `purpose` VARCHAR(48) NOT NULL,
  `template_name` VARCHAR(128) NOT NULL,
  `language` VARCHAR(16) NOT NULL,
  `category` VARCHAR(32) NOT NULL,
  `meta_template_id` VARCHAR(128) NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN',
  `rejection_reason` VARCHAR(500) NULL,
  `last_checked_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `tenant_whatsapp_meta_templates_public_id_key` (`public_id`),
  UNIQUE INDEX `tenant_meta_template_unique` (`tenant_id`, `purpose`, `template_name`),
  INDEX `tenant_meta_template_status_idx` (`tenant_id`, `status`),
  INDEX `tenant_meta_template_config_idx` (`whatsapp_config_id`),
  CONSTRAINT `tenant_whatsapp_meta_templates_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `tenant_whatsapp_meta_templates_config_id_fkey`
    FOREIGN KEY (`whatsapp_config_id`) REFERENCES `tenant_whatsapp_configs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
