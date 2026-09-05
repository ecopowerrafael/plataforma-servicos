-- Add originType to Payment
ALTER TABLE `payments` ADD COLUMN `origin_type` VARCHAR(50) NOT NULL DEFAULT 'APPOINTMENT';

-- Add planSnapshot to CustomerMembershipCharge
ALTER TABLE `customer_membership_charges` ADD COLUMN `plan_snapshot` JSON;

-- Backfill all existing payments as APPOINTMENT (no appointments will be null at this point)
UPDATE `payments` SET `origin_type` = 'APPOINTMENT' WHERE `appointment_id` IS NOT NULL;

-- Create unique index on originType constraint
-- Note: Database-level validation of invariant (not both null, not both populated) handled at application level
