ALTER TABLE `directory_categories`
  ADD COLUMN `external_search_terms` JSON NULL,
  ADD COLUMN `geoapify_categories` JSON NULL;

UPDATE `directory_categories`
SET `external_search_terms` = JSON_ARRAY('barber', 'barbershop'),
    `geoapify_categories` = JSON_ARRAY('service.beauty.hairdresser')
WHERE `slug` = 'barbearias';

CREATE TABLE `directory_postal_code_cache` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `cep` CHAR(8) NOT NULL,
  `city` VARCHAR(120) NOT NULL,
  `state` CHAR(2) NOT NULL,
  `neighborhood` VARCHAR(120) NULL,
  `street` VARCHAR(180) NULL,
  `latitude` DOUBLE NULL,
  `longitude` DOUBLE NULL,
  `provider` VARCHAR(40) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `udpcc_cep` (`cep`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `directory_external_search_cache` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `cache_key` CHAR(64) NOT NULL,
  `category_id` BIGINT UNSIGNED NOT NULL,
  `cep` CHAR(8) NOT NULL,
  `radius` INTEGER NOT NULL,
  `results` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `udesc_cache_key` (`cache_key`),
  INDEX `idesc_category_cep_radius` (`category_id`, `cep`, `radius`),
  CONSTRAINT `fdesc_category` FOREIGN KEY (`category_id`) REFERENCES `directory_categories` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
