CREATE TABLE `tenant_branding` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `use_profile_defaults` BOOLEAN NOT NULL DEFAULT true,
  `primary_color` CHAR(7) NOT NULL,
  `secondary_color` CHAR(7) NOT NULL,
  `accent_color` CHAR(7) NOT NULL,
  `background_color` CHAR(7) NOT NULL,
  `surface_color` CHAR(7) NOT NULL,
  `text_color` CHAR(7) NOT NULL,
  `muted_text_color` CHAR(7) NOT NULL,
  `border_color` CHAR(7) NOT NULL,
  `border_radius` VARCHAR(16) NOT NULL,
  `font_family` VARCHAR(64) NOT NULL,
  `logo_url` VARCHAR(2048) NULL,
  `favicon_url` VARCHAR(2048) NULL,
  `banner_url` VARCHAR(2048) NULL,
  `pwa_icon_url` VARCHAR(2048) NULL,
  `splash_url` VARCHAR(2048) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `tenant_branding_tenant_id_key`(`tenant_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `tenant_branding_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tenant_terminology` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `professional_singular` VARCHAR(80) NULL,
  `professional_plural` VARCHAR(80) NULL,
  `customer_singular` VARCHAR(80) NULL,
  `customer_plural` VARCHAR(80) NULL,
  `service_singular` VARCHAR(80) NULL,
  `service_plural` VARCHAR(80) NULL,
  `appointment_singular` VARCHAR(80) NULL,
  `appointment_plural` VARCHAR(80) NULL,
  `unit_singular` VARCHAR(80) NULL,
  `unit_plural` VARCHAR(80) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `tenant_terminology_tenant_id_key`(`tenant_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `tenant_terminology_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
