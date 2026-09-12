-- Add SEO quality fields to DirectoryBusiness
ALTER TABLE directory_businesses ADD COLUMN seo_quality_score TINYINT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE directory_businesses ADD COLUMN seo_eligible BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE directory_businesses ADD COLUMN seo_evaluated_at DATETIME(3) NULL;

-- Add indexes for SEO eligibility
CREATE INDEX `idx_db_seo_eligible_active` ON `directory_businesses`(`seo_eligible`, `active`);
CREATE INDEX `idx_db_category_seo_eligible` ON `directory_businesses`(`category_id`, `seo_eligible`);

-- Create DirectoryCityAggregate table
CREATE TABLE `directory_city_aggregates` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `category_id` BIGINT UNSIGNED NOT NULL,
  `city_slug` VARCHAR(180) NOT NULL,
  `city` VARCHAR(120) NOT NULL,
  `state` CHAR(2) NOT NULL,
  `business_count` INT NOT NULL DEFAULT 0,
  `seo_eligible_business_count` INT NOT NULL DEFAULT 0,
  `whatsapp_count` INT NOT NULL DEFAULT 0,
  `top_neighborhoods` JSON NOT NULL DEFAULT (JSON_ARRAY()),
  `last_business_updated_at` DATETIME(3) NULL,
  `seo_eligible` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `udca_category_city` (`category_id`, `city_slug`),
  INDEX `idx_dca_category_seo_eligible` (`category_id`, `seo_eligible`),
  INDEX `idx_dca_seo_eligible_count` (`seo_eligible_business_count`),
  CONSTRAINT `fk_dca_category` FOREIGN KEY (`category_id`) REFERENCES `directory_categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
