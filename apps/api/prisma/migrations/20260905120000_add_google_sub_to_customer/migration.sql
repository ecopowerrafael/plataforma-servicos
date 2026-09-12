-- Add Google OAuth identifier to Customer
-- Important: customer + google_sub is unique within a tenant, not globally
-- This allows the same Google account to be a customer in different tenants

ALTER TABLE `customers` ADD COLUMN `google_sub` VARCHAR(255) AFTER `password_hash`;

-- Composite unique constraint per tenant (tenantId + googleSub)
-- This allows:
-- - Tenant A: googleSub "abc" -> Customer X
-- - Tenant B: googleSub "abc" -> Customer Y (different tenant, same Google)
CREATE UNIQUE INDEX `idx_customers_tenant_google_sub` ON `customers`(`tenant_id`, `google_sub`);
