ALTER TABLE `whatsapp_outbound_messages`
  ADD COLUMN `customer_id` BIGINT UNSIGNED NULL,
  ADD COLUMN `notification_log_id` BIGINT UNSIGNED NULL,
  ADD COLUMN `error_code` VARCHAR(80) NULL,
  ADD COLUMN `delivered_at` DATETIME(3) NULL,
  ADD COLUMN `read_at` DATETIME(3) NULL,
  ADD COLUMN `failed_at` DATETIME(3) NULL;

ALTER TABLE `whatsapp_outbound_messages`
  ADD CONSTRAINT `whatsapp_outbound_messages_customer_id_fkey`
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `whatsapp_outbound_messages`
  ADD CONSTRAINT `whatsapp_outbound_messages_notification_log_id_fkey`
  FOREIGN KEY (`notification_log_id`) REFERENCES `notification_logs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `whatsapp_inbound_events`
  ADD COLUMN `text` TEXT NULL,
  ADD COLUMN `referenced_message_id` VARCHAR(191) NULL,
  ADD COLUMN `customer_id` BIGINT UNSIGNED NULL;

ALTER TABLE `whatsapp_inbound_events`
  ADD CONSTRAINT `whatsapp_inbound_events_customer_id_fkey`
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
