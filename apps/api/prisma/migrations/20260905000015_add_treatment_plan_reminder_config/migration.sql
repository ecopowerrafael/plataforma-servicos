-- CreateTable treatment_plan_reminder_config
CREATE TABLE `treatment_plan_reminder_config` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `channel` ENUM('WHATSAPP', 'EMAIL', 'PUSH') NOT NULL DEFAULT 'WHATSAPP',
  `sequence` JSON NOT NULL DEFAULT '[]',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `treatment_plan_reminder_config_tenant_id_key`(`tenant_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `treatment_plan_reminder_config` ADD CONSTRAINT `treatment_plan_reminder_config_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
