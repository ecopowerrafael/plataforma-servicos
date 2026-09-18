ALTER TABLE `whatsapp_inbound_events`
    ADD COLUMN `provider` VARCHAR(32) NOT NULL DEFAULT 'WAPI';

CREATE UNIQUE INDEX `whatsapp_inbound_events_provider_event_key`
    ON `whatsapp_inbound_events` (`tenant_id`, `provider`, `instance_id`, `external_message_id`, `event_type`);
