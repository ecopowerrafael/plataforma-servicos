-- Add scheduled_at to NotificationLog for tracking theoretical reminder time
ALTER TABLE `notification_logs` ADD COLUMN `scheduled_at` DATETIME(3);

-- Create appointment_reminder_config table
CREATE TABLE `appointment_reminder_configs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` BIGINT UNSIGNED NOT NULL UNIQUE,
  `day_before_enabled` BOOLEAN NOT NULL DEFAULT true,
  `day_before_days_before` SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  `day_before_hour` SMALLINT UNSIGNED NOT NULL DEFAULT 9,
  `day_before_minute` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `upcoming_enabled` BOOLEAN NOT NULL DEFAULT true,
  `upcoming_minutes_before` SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  CONSTRAINT `fk_reminder_config_tenant`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Index for fairness during reminder scheduling
CREATE INDEX `idx_appointment_tenant_status_starts`
  ON `appointments`(`tenant_id`, `status`, `starts_at`);
