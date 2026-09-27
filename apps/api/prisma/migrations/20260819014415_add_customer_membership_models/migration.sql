-- Create customer_membership_plans table
CREATE TABLE `customer_membership_plans` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `public_id` CHAR(36) UNIQUE NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `description` LONGTEXT,
  `price_cents` BIGINT UNSIGNED NOT NULL,
  `billing_interval` ENUM('MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL') NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `customer_membership_plans_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX `customer_membership_plans_tenant_id_active_sort_order_idx` (`tenant_id`, `active`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create customer_membership_plan_benefits table
CREATE TABLE `customer_membership_plan_benefits` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `public_id` CHAR(36) UNIQUE NOT NULL,
  `plan_id` BIGINT UNSIGNED NOT NULL,
  `service_id` BIGINT UNSIGNED NOT NULL,
  `type` ENUM('QUANTITY','UNLIMITED','DISCOUNT') NOT NULL,
  `quantity_per_cycle` INT UNSIGNED,
  `discount_percent` SMALLINT UNSIGNED,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `customer_membership_plan_benefits_plan_id_fkey`
    FOREIGN KEY (`plan_id`) REFERENCES `customer_membership_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `customer_membership_plan_benefits_service_id_fkey`
    FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  UNIQUE KEY `customer_membership_plan_benefits_plan_id_service_id_key` (`plan_id`, `service_id`),
  INDEX `customer_membership_plan_benefits_service_id_idx` (`service_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create customer_memberships table
CREATE TABLE `customer_memberships` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `public_id` CHAR(36) UNIQUE NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `customer_id` BIGINT UNSIGNED NOT NULL,
  `plan_id` BIGINT UNSIGNED NOT NULL,
  `status` ENUM('PENDING','ACTIVE','PAST_DUE','PAUSED','CANCELED','EXPIRED') NOT NULL DEFAULT 'PENDING',
  `started_at` DATETIME(3),
  `current_period_start` DATETIME(3),
  `current_period_end` DATETIME(3),
  `next_billing_at` DATETIME(3),
  `paused_at` DATETIME(3),
  `canceled_at` DATETIME(3),
  `cancel_at_period_end` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `customer_memberships_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_memberships_customer_id_fkey`
    FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_memberships_plan_id_fkey`
    FOREIGN KEY (`plan_id`) REFERENCES `customer_membership_plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  UNIQUE KEY `customer_memberships_tenant_id_customer_id_key` (`tenant_id`, `customer_id`),
  INDEX `customer_memberships_tenant_id_status_current_period_end_idx` (`tenant_id`, `status`, `current_period_end`),
  INDEX `customer_memberships_plan_id_idx` (`plan_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create customer_membership_charges table
CREATE TABLE `customer_membership_charges` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `public_id` CHAR(36) UNIQUE NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `membership_id` BIGINT UNSIGNED NOT NULL,
  `period_start` DATETIME(3) NOT NULL,
  `period_end` DATETIME(3) NOT NULL,
  `amount_cents` BIGINT UNSIGNED NOT NULL,
  `status` ENUM('PENDING','PAID','FAILED','CANCELED','REFUNDED') NOT NULL DEFAULT 'PENDING',
  `due_at` DATETIME(3) NOT NULL,
  `paid_at` DATETIME(3),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `customer_membership_charges_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_membership_charges_membership_id_fkey`
    FOREIGN KEY (`membership_id`) REFERENCES `customer_memberships`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  UNIQUE KEY `customer_membership_charges_membership_id_period_start_key` (`membership_id`, `period_start`),
  INDEX `customer_membership_charges_tenant_id_status_due_at_idx` (`tenant_id`, `status`, `due_at`),
  INDEX `idx_cmcharge_tenant_membership_created` (`tenant_id`, `membership_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create customer_membership_usages table
CREATE TABLE `customer_membership_usages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `public_id` CHAR(36) UNIQUE NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `membership_id` BIGINT UNSIGNED NOT NULL,
  `appointment_id` BIGINT UNSIGNED,
  `service_id` BIGINT UNSIGNED NOT NULL,
  `period_start` DATETIME(3) NOT NULL,
  `period_end` DATETIME(3) NOT NULL,
  `quantity` INT UNSIGNED NOT NULL,
  `status` ENUM('RESERVED','CONSUMED','RELEASED','REVERSED') NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `customer_membership_usages_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_membership_usages_membership_id_fkey`
    FOREIGN KEY (`membership_id`) REFERENCES `customer_memberships`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `customer_membership_usages_appointment_id_fkey`
    FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `customer_membership_usages_service_id_fkey`
    FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX `idx_cmuse_tenant_membership_status_period` (`tenant_id`, `membership_id`, `status`, `period_start`, `period_end`),
  INDEX `customer_membership_usages_appointment_id_idx` (`appointment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Now that customer_membership_charges exists, add Payment columns and FK
ALTER TABLE `payments`
ADD COLUMN `membership_charge_id` BIGINT UNSIGNED NULL AFTER `appointment_id`;

ALTER TABLE `payments`
MODIFY COLUMN `appointment_id` BIGINT UNSIGNED NULL;

ALTER TABLE `payments`
ADD CONSTRAINT `payments_membership_charge_id_fkey`
FOREIGN KEY (`membership_charge_id`)
REFERENCES `customer_membership_charges`(`id`)
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add index for payments to membership_charge_id (after column is added)
CREATE INDEX `idx_payments_tenant_membershipcharge_created`
ON `payments` (`tenant_id`, `membership_charge_id`, `created_at`);
