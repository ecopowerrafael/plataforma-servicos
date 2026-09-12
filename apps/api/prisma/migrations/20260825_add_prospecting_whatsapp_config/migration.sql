-- CreateTable ProspectingWhatsAppConfig
CREATE TABLE `prospecting_whatsapp_configs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `instance_id` VARCHAR(100) NOT NULL,
    `token_ciphertext` LONGTEXT NOT NULL,
    `phone_number` VARCHAR(20),
    `instance_name` VARCHAR(120),
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_connection_status` VARCHAR(50),
    `last_checked_at` DATETIME(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `prospecting_whatsapp_configs_public_id_key`(`public_id`),
    UNIQUE INDEX `prospecting_whatsapp_configs_instance_id_key`(`instance_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
