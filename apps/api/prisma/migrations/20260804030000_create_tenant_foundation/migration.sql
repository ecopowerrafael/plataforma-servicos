CREATE TABLE IF NOT EXISTS `tenants` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `slug` VARCHAR(63) NOT NULL,
  `legal_name` VARCHAR(160) NOT NULL,
  `display_name` VARCHAR(120) NOT NULL,
  `status` ENUM('ACTIVE', 'SUSPENDED', 'INACTIVE', 'PENDING') NOT NULL DEFAULT 'ACTIVE',
  `timezone` VARCHAR(64) NOT NULL,
  `locale` VARCHAR(16) NOT NULL,
  `currency` CHAR(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  CONSTRAINT `tenants_slug_format_check`
    CHECK (`slug` REGEXP '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT `tenants_slug_reserved_check`
    CHECK (`slug` NOT IN ('admin', 'api', 'app', 'health', 'login', 'logout', 'public', 'ready', 'support', 'system', 'www')),
  CONSTRAINT `tenants_locale_format_check`
    CHECK (`locale` REGEXP '^[a-z]{2,3}(-[A-Z]{2})?$'),
  CONSTRAINT `tenants_currency_check`
    CHECK (`currency` IN ('BRL', 'EUR', 'USD')),
  UNIQUE INDEX `tenants_public_id_key` (`public_id`),
  UNIQUE INDEX `tenants_slug_key` (`slug`),
  INDEX `tenants_status_idx` (`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tenant_settings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `allow_multiple_units` BOOLEAN NOT NULL DEFAULT false,
  `default_appointment_interval_minutes` SMALLINT UNSIGNED NOT NULL DEFAULT 15,
  `week_starts_on` ENUM('SUNDAY', 'MONDAY') NOT NULL DEFAULT 'MONDAY',
  `date_format` VARCHAR(16) NOT NULL DEFAULT 'DD/MM/YYYY',
  `time_format` ENUM('24H', '12H') NOT NULL DEFAULT '24H',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  CONSTRAINT `tenant_settings_interval_check`
    CHECK (`default_appointment_interval_minutes` IN (5, 10, 15, 20, 30, 60)),
  CONSTRAINT `tenant_settings_date_format_check`
    CHECK (`date_format` = 'DD/MM/YYYY'),
  UNIQUE INDEX `tenant_settings_tenant_id_key` (`tenant_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `business_units` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `slug` VARCHAR(63) NOT NULL,
  `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `is_headquarters` BOOLEAN NOT NULL DEFAULT false,
  `timezone` VARCHAR(64) NOT NULL,
  `postal_code` VARCHAR(16) NULL,
  `street` VARCHAR(160) NULL,
  `number` VARCHAR(20) NULL,
  `complement` VARCHAR(80) NULL,
  `district` VARCHAR(80) NULL,
  `city` VARCHAR(100) NULL,
  `state` VARCHAR(64) NULL,
  `country_code` CHAR(2) NULL,
  -- Coluna física preenchida pelos triggers abaixo: usa `tenant_id` apenas na
  -- matriz e NULL nas demais. O índice UNIQUE garante no máximo uma matriz.
  `headquarters_key` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  CONSTRAINT `business_units_slug_format_check`
    CHECK (`slug` REGEXP '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT `business_units_country_code_check`
    CHECK (`country_code` IS NULL OR `country_code` REGEXP '^[A-Z]{2}$'),
  UNIQUE INDEX `business_units_public_id_key` (`public_id`),
  UNIQUE INDEX `business_units_tenant_id_slug_key` (`tenant_id`, `slug`),
  UNIQUE INDEX `business_units_one_headquarters_per_tenant` (`headquarters_key`),
  INDEX `business_units_tenant_id_status_idx` (`tenant_id`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `tenant_settings`
  ADD CONSTRAINT `tenant_settings_tenant_id_fkey`
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `business_units`
  ADD CONSTRAINT `business_units_tenant_id_fkey`
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER `business_units_headquarters_before_insert`
BEFORE INSERT ON `business_units`
FOR EACH ROW SET NEW.`headquarters_key` = IF(NEW.`is_headquarters` = 1, NEW.`tenant_id`, NULL);

CREATE TRIGGER `business_units_headquarters_before_update`
BEFORE UPDATE ON `business_units`
FOR EACH ROW SET NEW.`headquarters_key` = IF(NEW.`is_headquarters` = 1, NEW.`tenant_id`, NULL);
