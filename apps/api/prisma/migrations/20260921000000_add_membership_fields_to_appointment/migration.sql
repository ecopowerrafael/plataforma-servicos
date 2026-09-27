-- Add membership-related fields to appointments table
ALTER TABLE `appointments` ADD COLUMN `charge_source` VARCHAR(50);
ALTER TABLE `appointments` ADD COLUMN `reference_price_cents` BIGINT UNSIGNED;
ALTER TABLE `appointments` ADD COLUMN `amount_due_cents` BIGINT UNSIGNED;
