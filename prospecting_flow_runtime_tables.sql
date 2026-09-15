-- SQL Manual: Criar tabelas faltantes do Prospecting Flow Runtime
-- Migration: 20260815120000_add_prospecting_flows (FALHA PARCIAL)
-- Baseado em schema.prisma ATUAL (commit 48ac64e)
-- Compatível com MariaDB 10.3+ / Hostinger

-- ============================================================================
-- 1. CREATE TABLE prospecting_flow_executions
-- ============================================================================
-- Tabela de rastreamento de execução de fluxo por lead+campaign
-- Status: ENUM (ACTIVE, WAITING, MANUAL, COMPLETED, CANCELED)
--
-- Diferenças vs migration antiga:
-- - status: ENUM (não VARCHAR)
-- - ON DELETE: CASCADE (não RESTRICT)
-- - sem índice em started_at

CREATE TABLE IF NOT EXISTS `prospecting_flow_executions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `lead_id` BIGINT UNSIGNED NOT NULL,
  `flow_id` BIGINT UNSIGNED NOT NULL,
  `current_step_id` BIGINT UNSIGNED NOT NULL,
  `status` ENUM('ACTIVE', 'WAITING', 'MANUAL', 'COMPLETED', 'CANCELED') NOT NULL,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE KEY `prospecting_flow_executions_public_id_key` (`public_id`),
  UNIQUE KEY `prospecting_flow_executions_campaign_id_lead_id_flow_id_key` (`campaign_id`, `lead_id`, `flow_id`),

  FOREIGN KEY `prospecting_flow_executions_campaign_id_fk` (`campaign_id`)
    REFERENCES `prospecting_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY `prospecting_flow_executions_lead_id_fk` (`lead_id`)
    REFERENCES `prospecting_leads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY `prospecting_flow_executions_flow_id_fk` (`flow_id`)
    REFERENCES `prospecting_flows`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY `prospecting_flow_executions_current_step_id_fk` (`current_step_id`)
    REFERENCES `prospecting_flow_steps`(`id`) ON UPDATE CASCADE,

  INDEX `prospecting_flow_executions_campaign_id_idx` (`campaign_id`),
  INDEX `prospecting_flow_executions_lead_id_idx` (`lead_id`),
  INDEX `prospecting_flow_executions_flow_id_idx` (`flow_id`),
  INDEX `prospecting_flow_executions_status_idx` (`status`)
) ENGINE InnoDB DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- 2. CREATE TABLE prospecting_flow_responses
-- ============================================================================
-- Histórico de respostas do lead durante fluxo
-- response_text: TEXT (não LONGTEXT)
-- Sem índice em created_at (vs migration antiga)

CREATE TABLE IF NOT EXISTS `prospecting_flow_responses` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `execution_id` BIGINT UNSIGNED NOT NULL,
  `step_id` BIGINT UNSIGNED NOT NULL,
  `inbound_message_id` BIGINT UNSIGNED NULL,
  `response_text` TEXT NOT NULL,
  `matched_option_id` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),

  FOREIGN KEY `prospecting_flow_responses_execution_id_fk` (`execution_id`)
    REFERENCES `prospecting_flow_executions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY `prospecting_flow_responses_step_id_fk` (`step_id`)
    REFERENCES `prospecting_flow_steps`(`id`) ON UPDATE CASCADE,
  FOREIGN KEY `prospecting_flow_responses_matched_option_id_fk` (`matched_option_id`)
    REFERENCES `prospecting_flow_options`(`id`) ON UPDATE CASCADE,

  INDEX `prospecting_flow_responses_execution_id_idx` (`execution_id`),
  INDEX `prospecting_flow_responses_step_id_idx` (`step_id`)
) ENGINE InnoDB DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Validação pós-execução
-- ============================================================================
-- SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
-- WHERE TABLE_SCHEMA = DATABASE()
-- AND TABLE_NAME IN ('prospecting_flow_executions', 'prospecting_flow_responses');

-- SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
-- FROM INFORMATION_SCHEMA.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'prospecting_flow_executions'
-- ORDER BY ORDINAL_POSITION;

-- SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
-- FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
-- WHERE TABLE_SCHEMA = DATABASE()
-- AND TABLE_NAME IN ('prospecting_flow_executions', 'prospecting_flow_responses')
-- AND CONSTRAINT_NAME != 'PRIMARY';
