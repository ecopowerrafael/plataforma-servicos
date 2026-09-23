-- CreateTable: commercial_accounts
CREATE TABLE `commercial_accounts` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `role` ENUM('MANAGER', 'REPRESENTATIVE', 'SELLER') NOT NULL,
    `parent_id` BIGINT UNSIGNED NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `default_commission_bps` INT NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `created_by_user_id` BIGINT UNSIGNED NOT NULL,

    UNIQUE INDEX `commercial_accounts_public_id_key`(`public_id`),
    INDEX `commercial_accounts_user_id_idx`(`user_id`),
    INDEX `commercial_accounts_parent_id_idx`(`parent_id`),
    INDEX `commercial_accounts_created_by_user_id_idx`(`created_by_user_id`),
    INDEX `commercial_accounts_role_idx`(`role`),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: commercial_regions
CREATE TABLE `commercial_regions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `manager_id` BIGINT UNSIGNED NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `commercial_regions_public_id_key`(`public_id`),
    INDEX `commercial_regions_manager_id_idx`(`manager_id`),
    INDEX `commercial_regions_active_idx`(`active`),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: commercial_region_cities
CREATE TABLE `commercial_region_cities` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `region_id` BIGINT UNSIGNED NOT NULL,
    `ibge_code` CHAR(7) NOT NULL,
    `city` VARCHAR(120) NOT NULL,
    `state` CHAR(2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `commercial_region_cities_ibge_code_key`(`ibge_code`),
    INDEX `commercial_region_cities_region_id_idx`(`region_id`),
    INDEX `commercial_region_cities_ibge_code_idx`(`ibge_code`),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: tenant_commercial_assignments
CREATE TABLE `tenant_commercial_assignments` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `tenant_id` BIGINT UNSIGNED NOT NULL,
    `manager_id` BIGINT UNSIGNED NULL,
    `representative_id` BIGINT UNSIGNED NULL,
    `seller_id` BIGINT UNSIGNED NULL,
    `source` ENUM('REGION_AUTO', 'CREATED_BY_MANAGER', 'CREATED_BY_REPRESENTATIVE', 'CREATED_BY_SELLER', 'GLOBAL_ADMIN', 'MANUAL_OVERRIDE') NOT NULL DEFAULT 'REGION_AUTO',
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `assigned_by_user_id` BIGINT UNSIGNED NULL,

    UNIQUE INDEX `tenant_commercial_assignments_tenant_id_key`(`tenant_id`),
    INDEX `tenant_commercial_assignments_tenant_id_idx`(`tenant_id`),
    INDEX `tenant_commercial_assignments_manager_id_idx`(`manager_id`),
    INDEX `tenant_commercial_assignments_representative_id_idx`(`representative_id`),
    INDEX `tenant_commercial_assignments_seller_id_idx`(`seller_id`),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `commercial_accounts` ADD CONSTRAINT `commercial_accounts_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commercial_accounts` ADD CONSTRAINT `commercial_accounts_parent_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `commercial_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commercial_accounts` ADD CONSTRAINT `commercial_accounts_created_by_user_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commercial_regions` ADD CONSTRAINT `commercial_regions_manager_id_fk` FOREIGN KEY (`manager_id`) REFERENCES `commercial_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commercial_region_cities` ADD CONSTRAINT `commercial_region_cities_region_id_fk` FOREIGN KEY (`region_id`) REFERENCES `commercial_regions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_commercial_assignments` ADD CONSTRAINT `tenant_commercial_assignments_tenant_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_commercial_assignments` ADD CONSTRAINT `tenant_commercial_assignments_manager_id_fk` FOREIGN KEY (`manager_id`) REFERENCES `commercial_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_commercial_assignments` ADD CONSTRAINT `tenant_commercial_assignments_representative_id_fk` FOREIGN KEY (`representative_id`) REFERENCES `commercial_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_commercial_assignments` ADD CONSTRAINT `tenant_commercial_assignments_seller_id_fk` FOREIGN KEY (`seller_id`) REFERENCES `commercial_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_commercial_assignments` ADD CONSTRAINT `tenant_commercial_assignments_assigned_by_user_id_fk` FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
