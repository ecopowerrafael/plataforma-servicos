-- Idempotente de propósito: esta migration já falhou em produção no meio do
-- caminho (o ALTER TABLE passou, o CREATE TABLE não), então precisa poder ser
-- reaplicada sobre um estado parcial sem erro.

-- Foto do cliente do site público (aditivo). MySQL não aceita
-- `ADD COLUMN IF NOT EXISTS`, então a coluna só é criada quando ainda não existe.
SET @add_photo_path := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `customers` ADD COLUMN `photo_path` VARCHAR(512) NULL',
    'SELECT 1'
  )
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'customers'
    AND `COLUMN_NAME` = 'photo_path'
);
PREPARE add_photo_path FROM @add_photo_path;
EXECUTE add_photo_path;
DEALLOCATE PREPARE add_photo_path;

-- Recuperação de senha do cliente, espelhando password_reset_tokens do staff.
-- O nome do índice composto fica em 36 caracteres: o MySQL limita
-- identificadores a 64 (erro 1059).
CREATE TABLE IF NOT EXISTS `customer_password_reset_tokens` (
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
  INDEX `cust_pwd_reset_customer_used_exp_idx` (`customer_id`, `used_at`, `expires_at`),
  INDEX `cust_pwd_reset_expires_at_idx` (`expires_at`),
  CONSTRAINT `cust_pwd_reset_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `cust_pwd_reset_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
