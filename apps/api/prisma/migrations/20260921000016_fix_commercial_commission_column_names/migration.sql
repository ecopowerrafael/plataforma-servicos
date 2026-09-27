-- Corrective migration: rename camelCase columns to snake_case for consistency
-- This migration is applied AFTER 00015 has been deployed

-- Drop existing index before renaming
DROP INDEX `commercial_commissions_paymentId_idx` ON `commercial_commissions`;

-- Rename camelCase columns to snake_case
ALTER TABLE `commercial_commissions`
  CHANGE COLUMN `paymentId` `payment_id` VARCHAR(255) NULL,
  CHANGE COLUMN `paymentSource` `payment_source` ENUM('GATEWAY', 'PIX', 'CARD', 'COMMERCIAL_WALLET', 'MANUAL_ADMIN') NULL;

-- Recreate index with correct column name
CREATE INDEX `commercial_commissions_payment_id_idx` ON `commercial_commissions`(`payment_id`);
