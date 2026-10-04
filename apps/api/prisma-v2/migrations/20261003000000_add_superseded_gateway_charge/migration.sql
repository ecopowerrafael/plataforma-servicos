ALTER TABLE `payment_gateway_charges`
  ADD COLUMN `superseded_at` DATETIME(3) NULL AFTER `reconciled_at`,
  ADD COLUMN `superseded_by_payment_id` BIGINT UNSIGNED NULL AFTER `superseded_at`,
  ADD KEY `payment_gateway_charges_tenant_superseded_idx` (`tenant_id`, `superseded_at`),
  ADD CONSTRAINT `payment_gateway_charges_superseded_by_payment_fk`
    FOREIGN KEY (`superseded_by_payment_id`) REFERENCES `payments` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
