-- Create DirectoryCityAggregateJob table for persistent, deduped queue
CREATE TABLE `directory_city_aggregate_jobs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL UNIQUE,

  `category_id` BIGINT UNSIGNED NOT NULL,
  `city_slug` VARCHAR(180) NOT NULL,

  `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  `attempts` INT NOT NULL DEFAULT 0,

  `pending_key` VARCHAR(220) UNIQUE NULL,
  `next_attempt_at` DATETIME(3) NULL,
  `last_error` TEXT NULL,

  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `processed_at` DATETIME(3) NULL,

  PRIMARY KEY (`id`),
  UNIQUE KEY `udcaj_pending_key` (`pending_key`),
  INDEX `idx_dcaj_status_next` (`status`, `next_attempt_at`),
  INDEX `idx_dcaj_category_city` (`category_id`, `city_slug`),
  CONSTRAINT `fk_dcaj_category` FOREIGN KEY (`category_id`) REFERENCES `directory_categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Index for backfill of seoEvaluatedAt
CREATE INDEX `idx_db_seo_evaluated_id` ON `directory_businesses`(`seo_evaluated_at`, `id`);
