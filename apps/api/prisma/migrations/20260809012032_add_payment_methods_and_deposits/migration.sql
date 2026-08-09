CREATE TABLE `payment_methods` (`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,`public_id` CHAR(36) NOT NULL,`tenant_id` BIGINT UNSIGNED NOT NULL,`name` VARCHAR(80) NOT NULL,`type` ENUM('CASH', 'PIX', 'DEBIT_CARD', 'CREDIT_CARD', 'BANK_TRANSFER', 'OTHER') NOT NULL,`sort_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0,`active` BOOLEAN NOT NULL DEFAULT true,`created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),`updated_at` DATETIME(3) NOT NULL,PRIMARY KEY (`id`),UNIQUE INDEX `payment_methods_public_id_key` (`public_id`),UNIQUE INDEX `payment_methods_tenant_id_name_key` (`tenant_id`,`name`),INDEX `payment_methods_tenant_id_active_sort_order_idx` (`tenant_id`,`active`,`sort_order`),CONSTRAINT `payment_methods_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `payments` DROP COLUMN `method`;

ALTER TABLE `payments` ADD COLUMN `payment_method_id` BIGINT UNSIGNED NOT NULL AFTER `appointment_id`;

ALTER TABLE `payments` ADD COLUMN `kind` ENUM('PAYMENT', 'DEPOSIT') NOT NULL DEFAULT 'PAYMENT' AFTER `payment_method_id`;

ALTER TABLE `payments` ADD CONSTRAINT `payments_payment_method_id_fkey` FOREIGN KEY (`payment_method_id`) REFERENCES `payment_methods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `appointments` ADD COLUMN `deposit_type` ENUM('FIXED', 'PERCENTAGE') NULL AFTER `checked_in_at`;

ALTER TABLE `appointments` ADD COLUMN `deposit_percentage` TINYINT UNSIGNED NULL AFTER `deposit_type`;

ALTER TABLE `appointments` ADD COLUMN `deposit_amount_cents` BIGINT UNSIGNED NULL AFTER `deposit_percentage`;
