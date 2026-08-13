-- Foto do cliente do site público (aditivo).
ALTER TABLE `customers`
  ADD COLUMN `photo_path` VARCHAR(512) NULL;

-- Recuperação de senha do cliente, espelhando password_reset_tokens do staff.
CREATE TABLE `customer_password_reset_tokens` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `customer_id` BIGINT UNSIGNED NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `used_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `requested_ip` VARCHAR(45) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `customer_password_reset_tokens_token_hash_key` (`token_hash`),
  INDEX `customer_password_reset_tokens_customer_id_used_at_expires_at_idx` (`customer_id`, `used_at`, `expires_at`),
  INDEX `customer_password_reset_tokens_expires_at_idx` (`expires_at`),
  CONSTRAINT `customer_password_reset_tokens_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_password_reset_tokens_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
