CREATE TABLE IF NOT EXISTS `notification_campaigns` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `idempotency_key` CHAR(36) NOT NULL,
  `audience` VARCHAR(24) NOT NULL,
  `channel` ENUM('EMAIL', 'PUSH', 'WHATSAPP', 'WEBHOOK') NOT NULL,
  `title` VARCHAR(160) NOT NULL,
  `message` TEXT NOT NULL,
  `status` ENUM('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'QUEUED',
  `recipient_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `eligible_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `skipped_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `delivery_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `materialized_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `started_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `notification_campaigns_public_id_key`(`public_id`),
  UNIQUE INDEX `notification_campaigns_tenant_id_idempotency_key_key`(`tenant_id`, `idempotency_key`),
  INDEX `notification_campaigns_tenant_id_created_at_idx`(`tenant_id`, `created_at`),
  INDEX `notification_campaigns_status_created_at_idx`(`status`, `created_at`),
  CONSTRAINT `notification_campaigns_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notification_campaign_recipients` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `target_public_id` CHAR(36) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `notification_campaign_recipients_public_id_key`(`public_id`),
  UNIQUE INDEX `ucr_campaign_target`(`campaign_id`, `target_public_id`),
  INDEX `notification_campaign_recipients_campaign_id_status_id_idx`(`campaign_id`, `status`, `id`),
  CONSTRAINT `notification_campaign_recipients_campaign_id_fkey`
    FOREIGN KEY (`campaign_id`) REFERENCES `notification_campaigns`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
