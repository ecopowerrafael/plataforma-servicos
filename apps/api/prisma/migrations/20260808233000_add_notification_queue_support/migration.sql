ALTER TABLE `notification_logs` MODIFY `status` ENUM('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'PENDING';

CREATE UNIQUE INDEX `notification_logs_target_key` ON `notification_logs`(`tenant_id`, `kind`, `target_type`, `target_public_id`);
