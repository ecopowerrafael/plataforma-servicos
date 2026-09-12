-- Tokens semanticos opcionais da marca. Aditiva e idempotente: colunas
-- nullable, entao tenants existentes continuam com a aparencia atual (o
-- fallback derivado permanece valendo enquanto o valor for NULL).

SET @add_0 := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tenant_branding'
        AND COLUMN_NAME = 'on_primary_color'
    ),
    'SELECT 1',
    'ALTER TABLE `tenant_branding` ADD COLUMN `on_primary_color` CHAR(7) NULL'
  )
);
PREPARE stmt FROM @add_0;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_1 := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tenant_branding'
        AND COLUMN_NAME = 'header_color'
    ),
    'SELECT 1',
    'ALTER TABLE `tenant_branding` ADD COLUMN `header_color` CHAR(7) NULL'
  )
);
PREPARE stmt FROM @add_1;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_2 := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tenant_branding'
        AND COLUMN_NAME = 'header_text_color'
    ),
    'SELECT 1',
    'ALTER TABLE `tenant_branding` ADD COLUMN `header_text_color` CHAR(7) NULL'
  )
);
PREPARE stmt FROM @add_2;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_3 := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tenant_branding'
        AND COLUMN_NAME = 'navigation_color'
    ),
    'SELECT 1',
    'ALTER TABLE `tenant_branding` ADD COLUMN `navigation_color` CHAR(7) NULL'
  )
);
PREPARE stmt FROM @add_3;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_4 := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tenant_branding'
        AND COLUMN_NAME = 'active_color'
    ),
    'SELECT 1',
    'ALTER TABLE `tenant_branding` ADD COLUMN `active_color` CHAR(7) NULL'
  )
);
PREPARE stmt FROM @add_4;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
