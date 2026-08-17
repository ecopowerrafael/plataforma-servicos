-- Servicos existentes continuam com preco fixo: o padrao preserva o comportamento atual.
ALTER TABLE `services`
  ADD COLUMN `pricing_mode` ENUM('FIXED', 'QUOTE') NOT NULL DEFAULT 'FIXED',
  ADD COLUMN `quote_notice` VARCHAR(160) NULL;

-- Agendamentos existentes sao atendimentos comuns.
ALTER TABLE `appointments`
  ADD COLUMN `kind` ENUM('STANDARD', 'EVALUATION', 'TREATMENT_SESSION') NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN `treatment_plan_id` BIGINT UNSIGNED NULL,
  ADD COLUMN `session_number` SMALLINT UNSIGNED NULL;

CREATE TABLE `treatment_plans` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `customer_id` BIGINT UNSIGNED NOT NULL,
  `service_id` BIGINT UNSIGNED NOT NULL,
  `professional_id` BIGINT UNSIGNED NOT NULL,
  `origin_appointment_id` BIGINT UNSIGNED NOT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED') NOT NULL DEFAULT 'PENDING',
  `billing_mode` ENUM('TOTAL', 'PER_SESSION') NOT NULL,
  `amount_cents` BIGINT UNSIGNED NOT NULL,
  `sessions_planned` SMALLINT UNSIGNED NULL,
  `return_interval_days` SMALLINT UNSIGNED NULL,
  `notes` VARCHAR(1000) NULL,
  `approved_at` DATETIME(3) NULL,
  `started_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  `canceled_at` DATETIME(3) NULL,
  `canceled_reason` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `treatment_plans_public_id_key`(`public_id`),
  UNIQUE INDEX `treatment_plans_origin_appointment_id_key`(`origin_appointment_id`),
  INDEX `treatment_plans_tenant_id_customer_id_status_idx`(`tenant_id`, `customer_id`, `status`),
  INDEX `treatment_plans_tenant_id_professional_id_status_idx`(`tenant_id`, `professional_id`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `treatment_plans`
  ADD CONSTRAINT `treatment_plans_tenant_id_fkey`
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `treatment_plans`
  ADD CONSTRAINT `treatment_plans_customer_id_fkey`
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `treatment_plans`
  ADD CONSTRAINT `treatment_plans_service_id_fkey`
  FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `treatment_plans`
  ADD CONSTRAINT `treatment_plans_professional_id_fkey`
  FOREIGN KEY (`professional_id`) REFERENCES `professionals`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `treatment_plans`
  ADD CONSTRAINT `treatment_plans_origin_appointment_id_fkey`
  FOREIGN KEY (`origin_appointment_id`) REFERENCES `appointments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX `appointments_tenant_id_treatment_plan_id_session_number_idx`
  ON `appointments`(`tenant_id`, `treatment_plan_id`, `session_number`);

ALTER TABLE `appointments`
  ADD CONSTRAINT `appointments_treatment_plan_id_fkey`
  FOREIGN KEY (`treatment_plan_id`) REFERENCES `treatment_plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
