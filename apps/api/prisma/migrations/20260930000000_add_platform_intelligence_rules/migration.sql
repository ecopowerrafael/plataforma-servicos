CREATE TABLE `platform_intelligence_rules` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `description` VARCHAR(1000) NULL,
  `intent` ENUM('BOOKING','AVAILABILITY','PRICE_QUERY','PAYMENT_METHODS','PAYMENT','CANCEL','RESCHEDULE','BOOKING_QUERY','UNKNOWN') NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `priority` SMALLINT NOT NULL DEFAULT 0,
  `base_confidence` DECIMAL(4,3) NOT NULL DEFAULT 0.650,
  `deleted_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `platform_intelligence_rules_public_id_key` (`public_id`),
  INDEX `platform_intelligence_rules_enabled_deleted_intent_priority_idx` (`enabled`, `deleted_at`, `intent`, `priority`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `platform_intelligence_rule_patterns` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `rule_id` BIGINT UNSIGNED NOT NULL,
  `pattern` VARCHAR(500) NOT NULL,
  `normalized_pattern` VARCHAR(500) NOT NULL,
  `sort_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `platform_intelligence_rule_patterns_public_id_key` (`public_id`),
  UNIQUE INDEX `platform_intelligence_rule_patterns_rule_normalized_key` (`rule_id`, `normalized_pattern`),
  INDEX `platform_intelligence_rule_patterns_rule_sort_idx` (`rule_id`, `sort_order`),
  CONSTRAINT `platform_intelligence_rule_patterns_rule_id_fkey` FOREIGN KEY (`rule_id`) REFERENCES `platform_intelligence_rules` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tenant_intelligence_entity_aliases` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `entity_type` VARCHAR(24) NOT NULL,
  `entity_public_id` CHAR(36) NOT NULL,
  `alias` VARCHAR(160) NOT NULL,
  `normalized_alias` VARCHAR(160) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `tenant_intelligence_entity_aliases_public_id_key` (`public_id`),
  UNIQUE INDEX `tenant_intelligence_entity_aliases_tenant_entity_alias_key` (`tenant_id`, `entity_type`, `entity_public_id`, `normalized_alias`),
  INDEX `tenant_intelligence_entity_aliases_tenant_type_alias_idx` (`tenant_id`, `entity_type`, `normalized_alias`),
  CONSTRAINT `tenant_intelligence_entity_aliases_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
