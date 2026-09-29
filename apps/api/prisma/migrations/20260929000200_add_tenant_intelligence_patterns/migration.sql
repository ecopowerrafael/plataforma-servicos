CREATE TABLE `tenant_intelligence_patterns` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `intent` ENUM('BOOKING','AVAILABILITY','PRICE_QUERY','PAYMENT_METHODS','PAYMENT','CANCEL','RESCHEDULE','BOOKING_QUERY','UNKNOWN') NOT NULL,
  `pattern` VARCHAR(500) NOT NULL,
  `normalized_pattern` VARCHAR(500) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `tenant_intelligence_patterns_public_id_key` (`public_id`),
  UNIQUE INDEX `tenant_intelligence_patterns_tenant_intent_pattern_key` (`tenant_id`, `intent`, `normalized_pattern`),
  INDEX `tenant_intelligence_patterns_tenant_intent_enabled_idx` (`tenant_id`, `intent`, `enabled`),
  CONSTRAINT `tenant_intelligence_patterns_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
