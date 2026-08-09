ALTER TABLE `professionals`
  ADD COLUMN `commission_type` ENUM('PERCENTAGE', 'FIXED') NOT NULL DEFAULT 'PERCENTAGE' AFTER `active`,
  ADD COLUMN `commission_value` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `commission_type`;

ALTER TABLE `professional_services`
  ADD COLUMN `commission_type` ENUM('PERCENTAGE', 'FIXED') NULL AFTER `post_service_break_minutes`,
  ADD COLUMN `commission_value` INT UNSIGNED NULL AFTER `commission_type`;
