-- Prospecting Flow - Phase A Complete
-- MySQL 5.7+ / MariaDB 10.3+ compatible
-- No partial indexes, no MySQL 8-only features

-- 1. Create main flow table
CREATE TABLE `prospecting_flows` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `code` VARCHAR(100),
  `name` VARCHAR(180) NOT NULL,
  `description` LONGTEXT,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_prospecting_flows_public_id` (`public_id`),
  UNIQUE KEY `uq_prospecting_flows_code` (`code`),
  INDEX `idx_prospecting_flows_is_active` (`is_active`)
) ENGINE InnoDB DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Create flow step table
CREATE TABLE `prospecting_flow_steps` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `flow_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(180) NOT NULL,
  `message` LONGTEXT NOT NULL,
  `step_type` VARCHAR(50) NOT NULL,
  `position` INT NOT NULL,
  `next_step_id` BIGINT UNSIGNED,
  `is_start` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_prospecting_flow_steps_public_id` (`public_id`),
  FOREIGN KEY `fk_prospecting_flow_steps_flow_id` (`flow_id`) REFERENCES `prospecting_flows`(`id`) ON DELETE CASCADE,
  FOREIGN KEY `fk_prospecting_flow_steps_next_step_id` (`next_step_id`) REFERENCES `prospecting_flow_steps`(`id`) ON DELETE SET NULL,
  INDEX `idx_prospecting_flow_steps_flow_id` (`flow_id`),
  INDEX `idx_prospecting_flow_steps_next_step_id` (`next_step_id`),
  INDEX `idx_prospecting_flow_steps_is_start` (`is_start`)
) ENGINE InnoDB DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3. Create flow option table
CREATE TABLE `prospecting_flow_options` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `step_id` BIGINT UNSIGNED NOT NULL,
  `label` VARCHAR(180) NOT NULL,
  `next_step_id` BIGINT UNSIGNED,
  `action_type` VARCHAR(50) NOT NULL,
  `position` INT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_prospecting_flow_options_public_id` (`public_id`),
  FOREIGN KEY `fk_prospecting_flow_options_step_id` (`step_id`) REFERENCES `prospecting_flow_steps`(`id`) ON DELETE CASCADE,
  FOREIGN KEY `fk_prospecting_flow_options_next_step_id` (`next_step_id`) REFERENCES `prospecting_flow_steps`(`id`) ON DELETE SET NULL,
  INDEX `idx_prospecting_flow_options_step_id` (`step_id`),
  INDEX `idx_prospecting_flow_options_next_step_id` (`next_step_id`)
) ENGINE InnoDB DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 4. Create flow option pattern table
CREATE TABLE `prospecting_flow_option_patterns` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `option_id` BIGINT UNSIGNED NOT NULL,
  `pattern` VARCHAR(500) NOT NULL,
  `pattern_type` VARCHAR(20) NOT NULL,
  `priority` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  FOREIGN KEY `fk_prospecting_flow_option_patterns_option_id` (`option_id`) REFERENCES `prospecting_flow_options`(`id`) ON DELETE CASCADE,
  INDEX `idx_prospecting_flow_option_patterns_option_id` (`option_id`),
  INDEX `idx_prospecting_flow_option_patterns_pattern_type` (`pattern_type`)
) ENGINE InnoDB DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 5. Create flow execution table
CREATE TABLE `prospecting_flow_executions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `lead_id` BIGINT UNSIGNED NOT NULL,
  `flow_id` BIGINT UNSIGNED NOT NULL,
  `current_step_id` BIGINT UNSIGNED NOT NULL,
  `status` VARCHAR(50) NOT NULL,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at` DATETIME(3),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_prospecting_flow_executions_public_id` (`public_id`),
  UNIQUE KEY `uq_prospecting_flow_executions_campaign_lead_flow` (`campaign_id`, `lead_id`, `flow_id`),
  FOREIGN KEY `fk_prospecting_flow_executions_campaign_id` (`campaign_id`) REFERENCES `prospecting_campaigns`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY `fk_prospecting_flow_executions_lead_id` (`lead_id`) REFERENCES `prospecting_leads`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY `fk_prospecting_flow_executions_flow_id` (`flow_id`) REFERENCES `prospecting_flows`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY `fk_prospecting_flow_executions_current_step_id` (`current_step_id`) REFERENCES `prospecting_flow_steps`(`id`),
  INDEX `idx_prospecting_flow_executions_campaign_id` (`campaign_id`),
  INDEX `idx_prospecting_flow_executions_lead_id` (`lead_id`),
  INDEX `idx_prospecting_flow_executions_flow_id` (`flow_id`),
  INDEX `idx_prospecting_flow_executions_status` (`status`),
  INDEX `idx_prospecting_flow_executions_started_at` (`started_at`)
) ENGINE InnoDB DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 6. Create flow response table
CREATE TABLE `prospecting_flow_responses` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `execution_id` BIGINT UNSIGNED NOT NULL,
  `step_id` BIGINT UNSIGNED NOT NULL,
  `inbound_message_id` BIGINT UNSIGNED,
  `response_text` LONGTEXT NOT NULL,
  `matched_option_id` BIGINT UNSIGNED,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  FOREIGN KEY `fk_prospecting_flow_responses_execution_id` (`execution_id`) REFERENCES `prospecting_flow_executions`(`id`) ON DELETE CASCADE,
  FOREIGN KEY `fk_prospecting_flow_responses_step_id` (`step_id`) REFERENCES `prospecting_flow_steps`(`id`),
  FOREIGN KEY `fk_prospecting_flow_responses_matched_option_id` (`matched_option_id`) REFERENCES `prospecting_flow_options`(`id`),
  INDEX `idx_prospecting_flow_responses_execution_id` (`execution_id`),
  INDEX `idx_prospecting_flow_responses_step_id` (`step_id`),
  INDEX `idx_prospecting_flow_responses_created_at` (`created_at`)
) ENGINE InnoDB DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 7. Add flow_id to prospecting_campaigns
ALTER TABLE `prospecting_campaigns` ADD COLUMN `flow_id` BIGINT UNSIGNED;

-- 8. Add flow_id foreign key and index
ALTER TABLE `prospecting_campaigns`
ADD FOREIGN KEY `fk_prospecting_campaigns_flow_id` (`flow_id`) REFERENCES `prospecting_flows`(`id`) ON DELETE SET NULL,
ADD INDEX `idx_prospecting_campaigns_flow_id` (`flow_id`);
