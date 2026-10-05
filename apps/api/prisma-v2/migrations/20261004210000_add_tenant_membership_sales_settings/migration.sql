ALTER TABLE `tenant_settings`
  ADD COLUMN `membership_sales_enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN `allow_single_service_sales` BOOLEAN NOT NULL DEFAULT TRUE;
