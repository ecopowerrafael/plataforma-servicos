CREATE TABLE `customer_membership_financial_reversals` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `membership_charge_id` BIGINT UNSIGNED NOT NULL,
  `payment_id` BIGINT UNSIGNED NULL,
  `payment_gateway_charge_id` BIGINT UNSIGNED NULL,
  `type` ENUM('REFUND', 'CHARGEBACK') NOT NULL,
  `amount_cents` BIGINT UNSIGNED NOT NULL,
  `effective_at` DATETIME(3) NOT NULL,
  `provider` VARCHAR(64) NULL,
  `external_reference` VARCHAR(191) NULL,
  `idempotency_key` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_membership_financial_reversals_public_id_key` (`public_id`),
  UNIQUE KEY `customer_membership_financial_reversals_tenant_idempotency_key` (`tenant_id`, `idempotency_key`),
  KEY `customer_membership_financial_reversals_tenant_effective_at_idx` (`tenant_id`, `effective_at`),
  KEY `customer_membership_financial_reversals_tenant_charge_idx` (`tenant_id`, `membership_charge_id`),
  KEY `customer_membership_financial_reversals_tenant_payment_idx` (`tenant_id`, `payment_id`),
  KEY `cm_fin_rev_tenant_gateway_idx` (`tenant_id`, `payment_gateway_charge_id`),
  CONSTRAINT `customer_membership_financial_reversals_tenant_fk`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_membership_financial_reversals_membership_charge_fk`
    FOREIGN KEY (`membership_charge_id`) REFERENCES `customer_membership_charges` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_membership_financial_reversals_payment_fk`
    FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_membership_financial_reversals_gateway_charge_fk`
    FOREIGN KEY (`payment_gateway_charge_id`) REFERENCES `payment_gateway_charges` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
