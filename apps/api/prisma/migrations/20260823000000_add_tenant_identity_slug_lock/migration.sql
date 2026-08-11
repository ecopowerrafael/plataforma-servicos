ALTER TABLE `tenants`
  ADD COLUMN `slug_changed_at` DATETIME(3) NULL AFTER `slug`;
