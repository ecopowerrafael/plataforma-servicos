-- CreateTable treatment_plan_reminder_states
CREATE TABLE `treatment_plan_reminder_states` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `treatment_plan_id` BIGINT UNSIGNED NOT NULL,
  `next_reminder_at` DATETIME(3) NULL,
  `last_reminder_at` DATETIME(3) NULL,
  `reminders_sent` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `status` ENUM('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELED') NOT NULL DEFAULT 'ACTIVE',
  `channel` ENUM('WHATSAPP', 'EMAIL', 'PUSH') NOT NULL DEFAULT 'WHATSAPP',
  `current_step_index` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `treatment_plan_reminder_states_treatment_plan_id_key`(`treatment_plan_id`),
  INDEX `treatment_plan_reminder_states_tenant_id_status_idx`(`tenant_id`, `status`),
  INDEX `treatment_plan_reminder_states_next_reminder_at_status_idx`(`next_reminder_at`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable treatment_plan_reminder_logs
CREATE TABLE `treatment_plan_reminder_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `reminder_state_id` BIGINT UNSIGNED NOT NULL,
  `step_index` SMALLINT UNSIGNED NOT NULL,
  `channel` ENUM('WHATSAPP', 'EMAIL', 'PUSH') NOT NULL,
  `sent_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `message_template` VARCHAR(500) NOT NULL,
  `sent_message` VARCHAR(1000) NOT NULL,
  `status` VARCHAR(50) NOT NULL,
  `error_message` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `treatment_plan_reminder_logs_tenant_id_idx`(`tenant_id`),
  INDEX `treatment_plan_reminder_logs_reminder_state_id_idx`(`reminder_state_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `treatment_plan_reminder_states` ADD CONSTRAINT `treatment_plan_reminder_states_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `treatment_plan_reminder_states` ADD CONSTRAINT `treatment_plan_reminder_states_treatment_plan_id_fkey` FOREIGN KEY (`treatment_plan_id`) REFERENCES `treatment_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `treatment_plan_reminder_logs` ADD CONSTRAINT `treatment_plan_reminder_logs_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `treatment_plan_reminder_logs` ADD CONSTRAINT `treatment_plan_reminder_logs_reminder_state_id_fkey` FOREIGN KEY (`reminder_state_id`) REFERENCES `treatment_plan_reminder_states`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
