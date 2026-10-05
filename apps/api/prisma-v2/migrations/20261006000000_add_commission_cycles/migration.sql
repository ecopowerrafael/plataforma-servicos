ALTER TABLE `payments`
  ADD COLUMN `paid_at` DATETIME(3) NULL AFTER `amount_cents`,
  ADD INDEX `payments_tenant_origin_status_paid_at_idx` (`tenant_id`, `origin_type`, `status`, `paid_at`);

ALTER TABLE `appointments`
  ADD COLUMN `completed_at` DATETIME(3) NULL AFTER `checked_in_at`,
  ADD INDEX `appointments_tenant_status_completed_at_charge_source_idx` (`tenant_id`, `status`, `completed_at`, `charge_source`);

ALTER TABLE `tenant_settings`
  ADD COLUMN `commission_team_percent_bps` SMALLINT UNSIGNED NULL,
  ADD COLUMN `commission_closing_day` TINYINT UNSIGNED NULL,
  ADD COLUMN `commission_effective_from` DATETIME(3) NULL;

CREATE TABLE `commission_cycles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `period_start` DATETIME(3) NOT NULL,
  `period_end` DATETIME(3) NOT NULL,
  `status` ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
  `closing_day` TINYINT UNSIGNED NOT NULL,
  `team_percent_bps` SMALLINT UNSIGNED NOT NULL,
  `effective_from` DATETIME(3) NULL,
  `eligible_revenue_cents` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `pool_cents` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `total_points` INT UNSIGNED NOT NULL DEFAULT 0,
  `distributed_cents` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `closed_at` DATETIME(3) NULL,
  `closed_by_user_id` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `commission_cycles_public_id_key` (`public_id`),
  UNIQUE KEY `commission_cycles_tenant_period_key` (`tenant_id`, `period_start`, `period_end`),
  KEY `commission_cycles_tenant_status_period_idx` (`tenant_id`, `status`, `period_start`, `period_end`),
  KEY `commission_cycles_closed_by_user_id_idx` (`closed_by_user_id`),
  CONSTRAINT `commission_cycles_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `commission_cycles_closed_by_user_fk` FOREIGN KEY (`closed_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commission_cycle_allocations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `cycle_id` BIGINT UNSIGNED NOT NULL,
  `professional_id` BIGINT UNSIGNED NOT NULL,
  `points` INT UNSIGNED NOT NULL,
  `amount_cents` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `commission_cycle_allocations_public_id_key` (`public_id`),
  UNIQUE KEY `commission_cycle_allocations_cycle_professional_key` (`cycle_id`, `professional_id`),
  KEY `commission_cycle_allocations_professional_created_idx` (`professional_id`, `created_at`),
  CONSTRAINT `commission_cycle_allocations_cycle_fk` FOREIGN KEY (`cycle_id`) REFERENCES `commission_cycles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `commission_cycle_allocations_professional_fk` FOREIGN KEY (`professional_id`) REFERENCES `professionals` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
