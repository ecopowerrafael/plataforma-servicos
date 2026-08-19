-- Add index for efficient queries
ALTER TABLE `payments` ADD INDEX `idx_payments_origin_type` (`origin_type`);
