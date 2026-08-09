ALTER TABLE `commercial_plans` MODIFY `trial_days` SMALLINT UNSIGNED NULL;

ALTER TABLE `tenant_subscriptions`
  ADD COLUMN `trial_started_at` DATETIME(3) NULL,
  ADD COLUMN `grace_ends_at` DATETIME(3) NULL;

CREATE TABLE `tenant_commercial_policies` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `singleton` BOOLEAN NOT NULL DEFAULT true,
  `default_trial_days` SMALLINT UNSIGNED NOT NULL DEFAULT 7,
  `grace_days` SMALLINT UNSIGNED NOT NULL DEFAULT 7,
  `auto_suspend_after_grace` BOOLEAN NOT NULL DEFAULT true,
  `allow_admin_login_while_blocked` BOOLEAN NOT NULL DEFAULT true,
  `allow_calendar_read_while_blocked` BOOLEAN NOT NULL DEFAULT true,
  `allow_admin_changes_while_blocked` BOOLEAN NOT NULL DEFAULT false,
  `allow_internal_booking_while_blocked` BOOLEAN NOT NULL DEFAULT false,
  `allow_public_booking_while_blocked` BOOLEAN NOT NULL DEFAULT false,
  `public_site_behavior_while_blocked` ENUM('NORMAL', 'HIDE_BOOKING', 'OFFLINE') NOT NULL DEFAULT 'HIDE_BOOKING',
  `admin_message` VARCHAR(1000) NOT NULL,
  `public_message` VARCHAR(1000) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `tenant_commercial_policies_public_id_key` (`public_id`),
  UNIQUE INDEX `tenant_commercial_policies_singleton_key` (`singleton`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
