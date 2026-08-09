CREATE TABLE `tenant_domains` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `hostname` VARCHAR(253) NOT NULL,
  `type` ENUM('CUSTOM','SUBDOMAIN') NOT NULL,
  `status` ENUM('PENDING','ACTIVE','FAILED') NOT NULL DEFAULT 'PENDING',
  `verification_token` CHAR(64) NOT NULL,
  `verified_at` DATETIME(3) NULL,
  `last_error` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `tenant_domains_public_id_key` (`public_id`),
  UNIQUE INDEX `tenant_domains_hostname_key` (`hostname`),
  INDEX `tenant_domains_tenant_id_status_idx` (`tenant_id`,`status`),
  CONSTRAINT `tenant_domains_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
