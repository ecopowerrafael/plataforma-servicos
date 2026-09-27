CREATE TABLE `wapi_remote_identity_mappings` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `instance_id` VARCHAR(100) NOT NULL,
    `remote_lid` VARCHAR(191) NOT NULL,
    `normalized_phone` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_wapi_remote_identity_instance_lid`(`instance_id`, `remote_lid`),
    INDEX `idx_wapi_remote_identity_phone`(`normalized_phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
