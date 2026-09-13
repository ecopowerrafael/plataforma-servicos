ALTER TABLE `prospecting_messages`
  DROP FOREIGN KEY `prospecting_messages_campaign_id_fkey`,
  DROP FOREIGN KEY `prospecting_messages_lead_id_fkey`;

ALTER TABLE `prospecting_messages`
  MODIFY COLUMN `campaign_id` BIGINT UNSIGNED NULL,
  MODIFY COLUMN `lead_id` BIGINT UNSIGNED NULL;

ALTER TABLE `prospecting_messages`
  ADD CONSTRAINT `prospecting_messages_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `prospecting_campaigns` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `prospecting_messages_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `prospecting_leads` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
