-- CreateTable
CREATE TABLE `commercial_manual_payments` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `tenant_id` BIGINT UNSIGNED NOT NULL,
    `subscription_id` BIGINT UNSIGNED NOT NULL,
    `manager_account_id` BIGINT UNSIGNED NOT NULL,
    `amount_cents` BIGINT UNSIGNED NOT NULL,
    `idempotency_key` CHAR(36) NOT NULL,
    `status` CHAR(20) NOT NULL DEFAULT 'PROCESSED',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processed_at` DATETIME(3) NULL,

    UNIQUE INDEX `commercial_manual_payments_public_id_key`(`public_id`),
    UNIQUE INDEX `ucmp_idempotency_key`(`idempotency_key`),
    INDEX `commercial_manual_payments_tenant_id_idx`(`tenant_id`),
    INDEX `commercial_manual_payments_subscription_id_idx`(`subscription_id`),
    INDEX `commercial_manual_payments_manager_account_id_idx`(`manager_account_id`),
    INDEX `commercial_manual_payments_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `commercial_manual_payments` ADD CONSTRAINT `commercial_manual_payments_tenant_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commercial_manual_payments` ADD CONSTRAINT `commercial_manual_payments_subscription_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `tenant_subscriptions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commercial_manual_payments` ADD CONSTRAINT `commercial_manual_payments_manager_account_id_fk` FOREIGN KEY (`manager_account_id`) REFERENCES `commercial_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
