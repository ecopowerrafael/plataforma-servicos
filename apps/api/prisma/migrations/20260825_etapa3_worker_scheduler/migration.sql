-- ETAPA 3: ProspectingWorker + Scheduler
-- Adiciona campos necessários para processamento de leads

-- ProspectingLead: campos para claim atômico
ALTER TABLE `prospecting_leads` ADD COLUMN `processing_worker_id` VARCHAR(255) NULL AFTER `human_lock_reason`;
ALTER TABLE `prospecting_leads` ADD COLUMN `processing_started_at` DATETIME(3) NULL AFTER `processing_worker_id`;
ALTER TABLE `prospecting_leads` ADD COLUMN `processing_expires_at` DATETIME(3) NULL AFTER `processing_started_at`;

-- Index para claim atômico e recovery
CREATE INDEX `idx_pld_processing_worker` ON `prospecting_leads` (`processing_worker_id`, `processing_expires_at`);

-- ProspectingCampaign: rate limit entre envios
ALTER TABLE `prospecting_campaigns` ADD COLUMN `next_send_at` DATETIME(3) NULL AFTER `completed_at`;

-- Index para verificação de rate limit
CREATE INDEX `idx_pca_next_send` ON `prospecting_campaigns` (`next_send_at`);

-- ProspectingMessage: campos para rastreamento e idempotência
ALTER TABLE `prospecting_messages` ADD COLUMN `step_number` SMALLINT UNSIGNED NULL AFTER `direction`;
ALTER TABLE `prospecting_messages` ADD COLUMN `template_id` BIGINT UNSIGNED NULL AFTER `step_number`;
ALTER TABLE `prospecting_messages` ADD COLUMN `variant_index` TINYINT UNSIGNED NULL AFTER `template_id`;
ALTER TABLE `prospecting_messages` ADD COLUMN `idempotency_key` VARCHAR(255) NULL AFTER `variant_index`;
ALTER TABLE `prospecting_messages` ADD COLUMN `sending_started_at` DATETIME(3) NULL AFTER `status`;
ALTER TABLE `prospecting_messages` ADD COLUMN `error_code` VARCHAR(100) NULL AFTER `error_message`;
ALTER TABLE `prospecting_messages` ADD COLUMN `attempt_number` TINYINT UNSIGNED NULL DEFAULT 1 AFTER `error_code`;

-- Index para idempotência
CREATE UNIQUE INDEX `idx_pmsg_idempotency_key` ON `prospecting_messages` (`campaign_id`, `idempotency_key`);

-- Index para verificação de SENDING stale
CREATE INDEX `idx_pmsg_sending_started` ON `prospecting_messages` (`status`, `sending_started_at`);

-- Foreign key para template
ALTER TABLE `prospecting_messages` ADD CONSTRAINT `fk_pmsg_template` FOREIGN KEY (`template_id`) REFERENCES `prospecting_templates` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Index para contagem de dailyLimit
CREATE INDEX `idx_pmsg_campaign_status_sent` ON `prospecting_messages` (`campaign_id`, `status`, `sent_at`);
