CREATE UNIQUE INDEX `tenant_whatsapp_configs_provider_external_id_key`
    ON `tenant_whatsapp_configs` (`provider`, `phone_number_id`);
