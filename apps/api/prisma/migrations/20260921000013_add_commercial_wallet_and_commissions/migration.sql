-- CreateTable
CREATE TABLE `commercial_wallet_entries` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `commercial_account_id` BIGINT UNSIGNED NOT NULL,
    `type` ENUM('COMMISSION_CREDIT', 'PLAN_PAYMENT_DEBIT', 'ADJUSTMENT_CREDIT', 'ADJUSTMENT_DEBIT', 'REVERSAL') NOT NULL,
    `amount_cents` DECIMAL(20,0) NOT NULL,
    `tenant_id` BIGINT UNSIGNED NULL,
    `subscription_id` BIGINT UNSIGNED NULL,
    `commission_id` BIGINT UNSIGNED NULL,
    `description` VARCHAR(255) NOT NULL,
    `metadata` JSON NULL,
    `created_by_user_id` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `commercial_wallet_entries_public_id_key`(`public_id`),
    INDEX `commercial_wallet_entries_commercial_account_id_created_at_idx`(`commercial_account_id`, `created_at`),
    INDEX `commercial_wallet_entries_type_created_at_idx`(`type`, `created_at`),
    INDEX `commercial_wallet_entries_tenant_id_idx`(`tenant_id`),
    INDEX `commercial_wallet_entries_subscription_id_idx`(`subscription_id`),
    INDEX `commercial_wallet_entries_commission_id_idx`(`commission_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commercial_commissions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `commercial_account_id` BIGINT UNSIGNED NOT NULL,
    `tenant_id` BIGINT UNSIGNED NOT NULL,
    `subscription_id` BIGINT UNSIGNED NOT NULL,
    `base_amount_cents` BIGINT UNSIGNED NOT NULL,
    `percentage_bps_snapshot` SMALLINT UNSIGNED NOT NULL,
    `commission_amount_cents` BIGINT UNSIGNED NOT NULL,
    `role_snapshot` VARCHAR(32) NOT NULL,
    `status` ENUM('PENDING', 'AVAILABLE', 'REVERSED') NOT NULL DEFAULT 'PENDING',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reversed_at` DATETIME(3) NULL,

    UNIQUE INDEX `commercial_commissions_public_id_key`(`public_id`),
    UNIQUE INDEX `ucc_account_subscription_date`(`commercial_account_id`, `subscription_id`, `created_at`),
    INDEX `commercial_commissions_commercial_account_id_status_idx`(`commercial_account_id`, `status`),
    INDEX `commercial_commissions_tenant_id_idx`(`tenant_id`),
    INDEX `commercial_commissions_subscription_id_idx`(`subscription_id`),
    INDEX `commercial_commissions_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commercial_commission_rules` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `commercial_account_id` BIGINT UNSIGNED NOT NULL,
    `plan_id` BIGINT UNSIGNED NULL,
    `percentage_bps` SMALLINT UNSIGNED NOT NULL,
    `effective_from` DATETIME(3) NOT NULL,
    `effective_until` DATETIME(3) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `commercial_commission_rules_public_id_key`(`public_id`),
    UNIQUE INDEX `uccr_account_plan_date`(`commercial_account_id`, `plan_id`, `effective_from`),
    INDEX `commercial_commission_rules_commercial_account_id_active_idx`(`commercial_account_id`, `active`),
    INDEX `commercial_commission_rules_plan_id_idx`(`plan_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `commercial_wallet_entries` ADD CONSTRAINT `commercial_wallet_entries_commercial_account_id_fk` FOREIGN KEY (`commercial_account_id`) REFERENCES `commercial_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commercial_wallet_entries` ADD CONSTRAINT `commercial_wallet_entries_tenant_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commercial_wallet_entries` ADD CONSTRAINT `commercial_wallet_entries_subscription_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `tenant_subscriptions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commercial_wallet_entries` ADD CONSTRAINT `commercial_wallet_entries_commission_id_fk` FOREIGN KEY (`commission_id`) REFERENCES `commercial_commissions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commercial_wallet_entries` ADD CONSTRAINT `commercial_wallet_entries_created_by_user_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commercial_commissions` ADD CONSTRAINT `commercial_commissions_commercial_account_id_fk` FOREIGN KEY (`commercial_account_id`) REFERENCES `commercial_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commercial_commissions` ADD CONSTRAINT `commercial_commissions_tenant_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commercial_commissions` ADD CONSTRAINT `commercial_commissions_subscription_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `tenant_subscriptions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commercial_commission_rules` ADD CONSTRAINT `commercial_commission_rules_commercial_account_id_fk` FOREIGN KEY (`commercial_account_id`) REFERENCES `commercial_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commercial_commission_rules` ADD CONSTRAINT `commercial_commission_rules_plan_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `commercial_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
