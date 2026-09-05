-- CreateTable DirectoryLocationConfig
CREATE TABLE `directory_location_config` (
    `id` BIGINT UNSIGNED NOT NULL DEFAULT 1,
    `geoapify_api_key_encrypted` VARCHAR(256) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
