-- CreateEnum
CREATE TYPE "prospecting_flow_execution_status" AS ENUM ('ACTIVE', 'WAITING', 'MANUAL', 'COMPLETED', 'CANCELED');

-- CreateTable
CREATE TABLE `prospecting_flow_executions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `campaign_id` BIGINT UNSIGNED NOT NULL,
    `lead_id` BIGINT UNSIGNED NOT NULL,
    `flow_id` BIGINT UNSIGNED NOT NULL,
    `current_step_id` BIGINT UNSIGNED NOT NULL,
    `status` `prospecting_flow_execution_status` NOT NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `prospecting_flow_executions_public_id_key`(`public_id`),
    UNIQUE INDEX `prospecting_flow_executions_campaign_id_lead_id_flow_id_key`(`campaign_id`, `lead_id`, `flow_id`),
    INDEX `prospecting_flow_executions_campaign_id_idx`(`campaign_id`),
    INDEX `prospecting_flow_executions_lead_id_idx`(`lead_id`),
    INDEX `prospecting_flow_executions_flow_id_idx`(`flow_id`),
    INDEX `prospecting_flow_executions_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prospecting_flow_responses` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `execution_id` BIGINT UNSIGNED NOT NULL,
    `step_id` BIGINT UNSIGNED NOT NULL,
    `inbound_message_id` BIGINT UNSIGNED NULL,
    `response_text` LONGTEXT NOT NULL,
    `matched_option_id` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `prospecting_flow_responses_execution_id_idx`(`execution_id`),
    INDEX `prospecting_flow_responses_step_id_idx`(`step_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `prospecting_flow_executions` ADD CONSTRAINT `prospecting_flow_executions_campaign_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `prospecting_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prospecting_flow_executions` ADD CONSTRAINT `prospecting_flow_executions_lead_id_fk` FOREIGN KEY (`lead_id`) REFERENCES `prospecting_leads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prospecting_flow_executions` ADD CONSTRAINT `prospecting_flow_executions_flow_id_fk` FOREIGN KEY (`flow_id`) REFERENCES `prospecting_flows`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prospecting_flow_executions` ADD CONSTRAINT `prospecting_flow_executions_current_step_id_fk` FOREIGN KEY (`current_step_id`) REFERENCES `prospecting_flow_steps`(`id`) ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prospecting_flow_responses` ADD CONSTRAINT `prospecting_flow_responses_execution_id_fk` FOREIGN KEY (`execution_id`) REFERENCES `prospecting_flow_executions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prospecting_flow_responses` ADD CONSTRAINT `prospecting_flow_responses_step_id_fk` FOREIGN KEY (`step_id`) REFERENCES `prospecting_flow_steps`(`id`) ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prospecting_flow_responses` ADD CONSTRAINT `prospecting_flow_responses_matched_option_id_fk` FOREIGN KEY (`matched_option_id`) REFERENCES `prospecting_flow_options`(`id`) ON UPDATE CASCADE;
