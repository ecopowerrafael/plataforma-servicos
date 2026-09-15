-- Bot Cobra Fase 6: PIX integral — generaliza Payment/PaymentGatewayCharge para Debt.

-- Payment: nova origem DEBT + FK opcional para debts.
ALTER TABLE `payments` MODIFY COLUMN `origin_type` ENUM('APPOINTMENT', 'MEMBERSHIP_CHARGE', 'DEBT') NOT NULL DEFAULT 'APPOINTMENT';
ALTER TABLE `payments` ADD COLUMN `debt_id` BIGINT UNSIGNED NULL;
ALTER TABLE `payments` ADD CONSTRAINT `payments_debt_id_fkey` FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX `payments_tenant_id_debt_id_created_at_idx` ON `payments`(`tenant_id`, `debt_id`, `created_at`);

-- PaymentGatewayCharge: appointment_id vira opcional, ganha origin_type/debt_id/reconciled_at.
ALTER TABLE `payment_gateway_charges` MODIFY COLUMN `appointment_id` BIGINT UNSIGNED NULL;
ALTER TABLE `payment_gateway_charges` ADD COLUMN `origin_type` ENUM('APPOINTMENT', 'DEBT') NOT NULL DEFAULT 'APPOINTMENT';
ALTER TABLE `payment_gateway_charges` ADD COLUMN `debt_id` BIGINT UNSIGNED NULL;
ALTER TABLE `payment_gateway_charges` ADD COLUMN `reconciled_at` DATETIME(3) NULL;
ALTER TABLE `payment_gateway_charges` ADD CONSTRAINT `payment_gateway_charges_debt_id_fkey` FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX `payment_gateway_charges_tenant_id_debt_id_idx` ON `payment_gateway_charges`(`tenant_id`, `debt_id`);

-- DebtPaymentAllocation: ponte de rastreabilidade Debt <-> Payment real.
CREATE TABLE `debt_payment_allocations` (`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `public_id` CHAR(36) NOT NULL, `tenant_id` BIGINT UNSIGNED NOT NULL, `debt_id` BIGINT UNSIGNED NOT NULL, `payment_id` BIGINT UNSIGNED NOT NULL, `amount_cents` BIGINT UNSIGNED NOT NULL, `source` ENUM('BOT_PIX', 'MANUAL', 'APPOINTMENT_PAYMENT', 'OTHER') NOT NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`), UNIQUE INDEX `debt_payment_allocations_public_id_key` (`public_id`), UNIQUE INDEX `debt_payment_allocations_debt_id_payment_id_key` (`debt_id`, `payment_id`), INDEX `debt_payment_allocations_tenant_id_debt_id_idx` (`tenant_id`, `debt_id`), CONSTRAINT `debt_payment_allocations_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE, CONSTRAINT `debt_payment_allocations_debt_id_fkey` FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE, CONSTRAINT `debt_payment_allocations_payment_id_fkey` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
