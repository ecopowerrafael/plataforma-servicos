CREATE UNIQUE INDEX `payment_gateway_configs_tenant_id_provider_key` ON `payment_gateway_configs`(`tenant_id`, `provider`);

DROP INDEX `payment_gateway_configs_tenant_id_key` ON `payment_gateway_configs`;

ALTER TABLE `payment_gateway_charges` ADD COLUMN `kind` ENUM('PAYMENT', 'DEPOSIT') NOT NULL DEFAULT 'PAYMENT' AFTER `environment`;

ALTER TABLE `payment_gateway_charges` ADD COLUMN `pix_copy_paste` TEXT NULL AFTER `idempotency_key`;

ALTER TABLE `tenant_settings` ADD COLUMN `pay_local_enabled` BOOLEAN NOT NULL DEFAULT true AFTER `time_format`;
