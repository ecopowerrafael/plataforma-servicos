-- Add external negative search terms for category filtering
ALTER TABLE `directory_category` ADD COLUMN `external_negative_terms` JSON NULL;
