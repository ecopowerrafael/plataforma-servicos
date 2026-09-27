-- Add external negative search terms for category filtering
ALTER TABLE `directory_categories` ADD COLUMN `external_negative_terms` JSON NULL;
