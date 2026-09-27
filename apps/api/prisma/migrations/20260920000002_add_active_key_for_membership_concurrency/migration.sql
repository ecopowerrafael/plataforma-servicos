-- Add activeKey for concurrency protection
ALTER TABLE `customer_memberships` ADD COLUMN `active_key` VARCHAR(100) UNIQUE;

-- Populate activeKey for PENDING/ACTIVE/PAST_DUE/PAUSED memberships
UPDATE `customer_memberships`
SET `active_key` = CONCAT(tenant_id, ':', customer_id)
WHERE `status` IN ('PENDING', 'ACTIVE', 'PAST_DUE', 'PAUSED');

-- NULL for CANCELED/EXPIRED (history, not blocking new memberships)
-- Already NULL by default for those rows
