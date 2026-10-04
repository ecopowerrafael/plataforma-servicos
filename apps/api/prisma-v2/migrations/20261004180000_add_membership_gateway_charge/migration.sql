ALTER TABLE `payment_gateway_charges`
  MODIFY COLUMN `origin_type` ENUM('APPOINTMENT', 'DEBT', 'MEMBERSHIP_CHARGE') NOT NULL DEFAULT 'APPOINTMENT',
  ADD COLUMN `membership_charge_id` BIGINT UNSIGNED NULL AFTER `debt_id`,
  ADD KEY `payment_gateway_charges_tenant_membership_charge_idx` (`tenant_id`, `membership_charge_id`),
  ADD CONSTRAINT `payment_gateway_charges_membership_charge_fk`
    FOREIGN KEY (`membership_charge_id`) REFERENCES `customer_membership_charges` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
