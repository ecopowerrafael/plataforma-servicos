-- Remove UNIQUE constraint from membershipChargeId to allow multiple Payment attempts per Charge
ALTER TABLE `payments` DROP INDEX `payments_membership_charge_id_key`;

-- Add index for efficient queries (already exists as part of foreign key, but making explicit)
ALTER TABLE `payments` ADD INDEX `idx_payments_origin_type` (`origin_type`);
