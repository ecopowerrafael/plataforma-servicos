-- Publicação do PWA por tenant. Aditiva e idempotente: tenants existentes
-- permanecem em DRAFT (nenhuma publicação retroativa).
SET @add_status := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tenant_public_sites'
        AND COLUMN_NAME = 'pwa_status'
    ),
    'SELECT 1',
    'ALTER TABLE `tenant_public_sites` ADD COLUMN `pwa_status` ENUM(''DRAFT'', ''PUBLISHED'') NOT NULL DEFAULT ''DRAFT'''
  )
);
PREPARE stmt FROM @add_status;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_published_at := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tenant_public_sites'
        AND COLUMN_NAME = 'pwa_published_at'
    ),
    'SELECT 1',
    'ALTER TABLE `tenant_public_sites` ADD COLUMN `pwa_published_at` DATETIME(3) NULL'
  )
);
PREPARE stmt FROM @add_published_at;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
