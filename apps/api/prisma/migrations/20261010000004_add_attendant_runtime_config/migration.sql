ALTER TABLE `prospecting_whatsapp_configs`
  ADD COLUMN `use_contact_name` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `invalid_message` TEXT NULL,
  ADD COLUMN `human_transfer_message` TEXT NULL,
  ADD COLUMN `business_hours_start` SMALLINT UNSIGNED NULL,
  ADD COLUMN `business_hours_end` SMALLINT UNSIGNED NULL,
  ADD COLUMN `outside_hours_message` TEXT NULL,
  ADD COLUMN `reply_delay_seconds` INT UNSIGNED NOT NULL DEFAULT 0;
