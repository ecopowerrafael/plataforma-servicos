ALTER TABLE `appointments` ADD COLUMN `checked_in_at` DATETIME(3) NULL AFTER `fit_in_reason`;

ALTER TABLE `appointment_history_entries` MODIFY `action` ENUM('CREATED', 'STATUS_CHANGED', 'RESCHEDULED', 'CHECKED_IN') NOT NULL;
