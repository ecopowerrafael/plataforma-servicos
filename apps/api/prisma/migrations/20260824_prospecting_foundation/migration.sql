-- CreateTable ProspectingCampaign
CREATE TABLE `prospecting_campaigns` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `name` VARCHAR(180) NOT NULL,
    `status` ENUM('DRAFT', 'READY', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELED') NOT NULL DEFAULT 'DRAFT',
    `category_id` BIGINT UNSIGNED NULL,
    `state` CHAR(2) NULL,
    `city` VARCHAR(120) NULL,
    `daily_limit` SMALLINT UNSIGNED NOT NULL DEFAULT 100,
    `sending_start_minutes` SMALLINT UNSIGNED NOT NULL DEFAULT 540,
    `sending_end_minutes` SMALLINT UNSIGNED NOT NULL DEFAULT 1080,
    `min_interval_seconds` SMALLINT UNSIGNED NOT NULL DEFAULT 30,
    `max_interval_seconds` SMALLINT UNSIGNED NOT NULL DEFAULT 120,
    `allowed_weekdays` JSON NOT NULL,
    `follow_up_enabled` BOOLEAN NOT NULL DEFAULT false,
    `follow_up_after_hours` SMALLINT UNSIGNED NULL,
    `max_follow_ups` TINYINT UNSIGNED NOT NULL DEFAULT 2,
    `pause_on_reply` BOOLEAN NOT NULL DEFAULT true,
    `pause_on_interest` BOOLEAN NOT NULL DEFAULT true,
    `started_at` DATETIME(3) NULL,
    `paused_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `prospecting_campaigns_public_id_key`(`public_id`),
    INDEX `prospecting_campaigns_status_started_at_idx`(`status`, `started_at`),
    INDEX `prospecting_campaigns_category_id_state_city_idx`(`category_id`, `state`, `city`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable ProspectingLead
CREATE TABLE `prospecting_leads` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `campaign_id` BIGINT UNSIGNED NOT NULL,
    `directory_business_id` BIGINT UNSIGNED NOT NULL,
    `phone_snapshot` VARCHAR(20) NOT NULL,
    `normalized_phone` VARCHAR(20) NOT NULL,
    `name_snapshot` VARCHAR(180) NOT NULL,
    `status` ENUM('PENDING', 'SCHEDULED', 'CONTACTED', 'WAITING_REPLY', 'RESPONDED', 'QUALIFYING', 'INTERESTED', 'DEMO_SENT', 'FOLLOW_UP', 'WON', 'LOST', 'NO_RESPONSE', 'SUPPRESSED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `current_step` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `next_action_at` DATETIME(3) NULL,
    `attempt_count` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `follow_up_count` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `last_outbound_at` DATETIME(3) NULL,
    `last_inbound_at` DATETIME(3) NULL,
    `responded_at` DATETIME(3) NULL,
    `interested_at` DATETIME(3) NULL,
    `converted_at` DATETIME(3) NULL,
    `human_lock_started_at` DATETIME(3) NULL,
    `human_lock_until` DATETIME(3) NULL,
    `human_lock_reason` VARCHAR(500) NULL,
    `suppressed_at` DATETIME(3) NULL,
    `suppression_reason` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `prospecting_leads_public_id_key`(`public_id`),
    INDEX `prospecting_leads_campaign_id_status_next_action_at_idx`(`campaign_id`, `status`, `next_action_at`),
    INDEX `prospecting_leads_normalized_phone_idx`(`normalized_phone`),
    INDEX `prospecting_leads_human_lock_until_idx`(`human_lock_until`),
    UNIQUE INDEX `upld_campaign_business`(`campaign_id`, `directory_business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable ProspectingMessage
CREATE TABLE `prospecting_messages` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `campaign_id` BIGINT UNSIGNED NOT NULL,
    `lead_id` BIGINT UNSIGNED NOT NULL,
    `direction` VARCHAR(20) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    `body` TEXT NOT NULL,
    `external_message_id` VARCHAR(100) NULL,
    `sent_at` DATETIME(3) NULL,
    `delivered_at` DATETIME(3) NULL,
    `read_at` DATETIME(3) NULL,
    `failed_at` DATETIME(3) NULL,
    `error_message` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `prospecting_messages_public_id_key`(`public_id`),
    INDEX `prospecting_messages_campaign_id_status_idx`(`campaign_id`, `status`),
    INDEX `prospecting_messages_lead_id_direction_created_at_idx`(`lead_id`, `direction`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable ProspectingTemplate
CREATE TABLE `prospecting_templates` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `campaign_id` BIGINT UNSIGNED NOT NULL,
    `step_number` SMALLINT UNSIGNED NOT NULL,
    `name` VARCHAR(180) NOT NULL,
    `body` TEXT NOT NULL,
    `type` VARCHAR(20) NOT NULL DEFAULT 'TEXT',
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `prospecting_templates_public_id_key`(`public_id`),
    INDEX `prospecting_templates_campaign_id_step_number_idx`(`campaign_id`, `step_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable ProspectingTemplateVariant
CREATE TABLE `prospecting_template_variants` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `template_id` BIGINT UNSIGNED NOT NULL,
    `variant_index` TINYINT UNSIGNED NOT NULL,
    `body` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uptv_template_variant`(`template_id`, `variant_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable ProspectingObjection
CREATE TABLE `prospecting_objections` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `name` VARCHAR(180) NOT NULL,
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `prospecting_objections_public_id_key`(`public_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable ProspectingObjectionPattern
CREATE TABLE `prospecting_objection_patterns` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `objection_id` BIGINT UNSIGNED NOT NULL,
    `pattern_type` ENUM('EXACT', 'STARTS_WITH', 'ENDS_WITH', 'CONTAINS') NOT NULL,
    `pattern` VARCHAR(500) NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `prospecting_objection_patterns_objection_id_priority_idx`(`objection_id`, `priority`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable ProspectingObjectionExclusion
CREATE TABLE `prospecting_objection_exclusions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `campaign_id` BIGINT UNSIGNED NOT NULL,
    `objection_id` BIGINT UNSIGNED NOT NULL,
    `exclude_follow_up` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `upoe_campaign_objection`(`campaign_id`, `objection_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable ProspectingSuppression
CREATE TABLE `prospecting_suppressions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `campaign_id` BIGINT UNSIGNED NOT NULL,
    `normalized_phone` VARCHAR(20) NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `suppressed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `prospecting_suppressions_campaign_id_normalized_phone_idx`(`campaign_id`, `normalized_phone`),
    UNIQUE INDEX `ups_campaign_phone`(`campaign_id`, `normalized_phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable PlatformWhatsAppConfig
CREATE TABLE `platform_whatsapp_configs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `phone_number_id` VARCHAR(100) NOT NULL,
    `phone_number` VARCHAR(20) NOT NULL,
    `business_account_id` VARCHAR(100) NOT NULL,
    `accessToken` TEXT NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `platform_whatsapp_configs_public_id_key`(`public_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `prospecting_campaigns` ADD CONSTRAINT `prospecting_campaigns_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `directory_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prospecting_leads` ADD CONSTRAINT `prospecting_leads_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `prospecting_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prospecting_leads` ADD CONSTRAINT `prospecting_leads_directory_business_id_fkey` FOREIGN KEY (`directory_business_id`) REFERENCES `directory_businesses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prospecting_messages` ADD CONSTRAINT `prospecting_messages_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `prospecting_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prospecting_messages` ADD CONSTRAINT `prospecting_messages_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `prospecting_leads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prospecting_templates` ADD CONSTRAINT `prospecting_templates_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `prospecting_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prospecting_template_variants` ADD CONSTRAINT `prospecting_template_variants_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `prospecting_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prospecting_objection_patterns` ADD CONSTRAINT `prospecting_objection_patterns_objection_id_fkey` FOREIGN KEY (`objection_id`) REFERENCES `prospecting_objections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prospecting_objection_exclusions` ADD CONSTRAINT `prospecting_objection_exclusions_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `prospecting_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prospecting_objection_exclusions` ADD CONSTRAINT `prospecting_objection_exclusions_objection_id_fkey` FOREIGN KEY (`objection_id`) REFERENCES `prospecting_objections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prospecting_suppressions` ADD CONSTRAINT `prospecting_suppressions_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `prospecting_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
