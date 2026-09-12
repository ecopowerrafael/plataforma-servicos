ALTER TABLE `business_units`
  ADD COLUMN `latitude` DOUBLE NULL,
  ADD COLUMN `longitude` DOUBLE NULL,
  ADD COLUMN `google_maps_url` VARCHAR(2048) NULL;
