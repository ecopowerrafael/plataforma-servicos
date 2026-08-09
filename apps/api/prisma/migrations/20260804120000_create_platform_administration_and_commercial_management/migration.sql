CREATE TABLE `platform_administrators` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `status` ENUM('ACTIVE', 'SUSPENDED', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_by_user_id` BIGINT UNSIGNED NULL,
  `last_access_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `platform_administrators_public_id_key` (`public_id`),
  UNIQUE KEY `platform_administrators_user_id_key` (`user_id`),
  KEY `platform_administrators_status_idx` (`status`),
  KEY `platform_administrators_created_by_user_id_idx` (`created_by_user_id`),
  CONSTRAINT `platform_administrators_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `platform_administrators_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `platform_roles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `is_system` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `platform_roles_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `platform_permissions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `platform_permissions_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `platform_role_permissions` (
  `role_id` BIGINT UNSIGNED NOT NULL,
  `permission_id` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`role_id`, `permission_id`),
  KEY `platform_role_permissions_permission_id_idx` (`permission_id`),
  CONSTRAINT `platform_role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `platform_roles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `platform_role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `platform_permissions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `platform_administrator_roles` (
  `administrator_id` BIGINT UNSIGNED NOT NULL,
  `role_id` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`administrator_id`, `role_id`),
  KEY `platform_administrator_roles_role_id_idx` (`role_id`),
  CONSTRAINT `platform_administrator_roles_administrator_id_fkey` FOREIGN KEY (`administrator_id`) REFERENCES `platform_administrators` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `platform_administrator_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `platform_roles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commercial_plans` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `description` VARCHAR(500) NULL,
  `status` ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  `billing_cycle` ENUM('MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'CUSTOM') NOT NULL,
  `price_cents` BIGINT UNSIGNED NOT NULL,
  `currency` CHAR(3) NOT NULL,
  `trial_days` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `is_public` BOOLEAN NOT NULL DEFAULT FALSE,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `commercial_plans_public_id_key` (`public_id`),
  UNIQUE KEY `commercial_plans_code_key` (`code`),
  KEY `commercial_plans_status_sort_order_idx` (`status`, `sort_order`),
  KEY `commercial_plans_billing_cycle_idx` (`billing_cycle`),
  CONSTRAINT `commercial_plans_code_format_check` CHECK (`code` REGEXP '^[A-Z][A-Z0-9_]{1,63}$'),
  CONSTRAINT `commercial_plans_currency_format_check` CHECK (`currency` REGEXP '^[A-Z]{3}$'),
  CONSTRAINT `commercial_plans_trial_days_check` CHECK (`trial_days` <= 3650)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `plan_limits` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `plan_id` BIGINT UNSIGNED NOT NULL,
  `key` VARCHAR(100) NOT NULL,
  `value_type` ENUM('INTEGER', 'BOOLEAN', 'STRING') NOT NULL,
  `integer_value` BIGINT UNSIGNED NULL,
  `boolean_value` BOOLEAN NULL,
  `string_value` VARCHAR(255) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `plan_limits_plan_id_key_key` (`plan_id`, `key`),
  CONSTRAINT `plan_limits_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `commercial_plans` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `plan_limits_key_check` CHECK (`key` IN ('units.max', 'members.max', 'professionals.max', 'monthly_appointments.max', 'storage.megabytes', 'branding.customization.enabled', 'custom_domain.enabled', 'advanced_reports.enabled', 'priority_support.enabled')),
  CONSTRAINT `plan_limits_value_check` CHECK ((`value_type` = 'INTEGER' AND `boolean_value` IS NULL AND `string_value` IS NULL) OR (`value_type` = 'BOOLEAN' AND `integer_value` IS NULL AND `string_value` IS NULL AND `boolean_value` IS NOT NULL) OR (`value_type` = 'STRING' AND `integer_value` IS NULL AND `boolean_value` IS NULL AND `string_value` IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tenant_subscriptions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `plan_id` BIGINT UNSIGNED NOT NULL,
  `status` ENUM('TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELED', 'EXPIRED') NOT NULL,
  `starts_at` DATETIME(3) NOT NULL,
  `trial_ends_at` DATETIME(3) NULL,
  `current_period_starts_at` DATETIME(3) NOT NULL,
  `current_period_ends_at` DATETIME(3) NOT NULL,
  `canceled_at` DATETIME(3) NULL,
  `suspended_at` DATETIME(3) NULL,
  `ends_at` DATETIME(3) NULL,
  `price_cents` BIGINT UNSIGNED NOT NULL,
  `currency` CHAR(3) NOT NULL,
  `billing_cycle` ENUM('MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'CUSTOM') NOT NULL,
  `effective_key` VARCHAR(20) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_subscriptions_public_id_key` (`public_id`),
  UNIQUE KEY `tenant_subscriptions_tenant_id_effective_key_key` (`tenant_id`, `effective_key`),
  KEY `tenant_subscriptions_status_current_period_ends_at_idx` (`status`, `current_period_ends_at`),
  KEY `tenant_subscriptions_plan_id_status_idx` (`plan_id`, `status`),
  CONSTRAINT `tenant_subscriptions_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `tenant_subscriptions_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `commercial_plans` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `tenant_subscriptions_dates_check` CHECK (`current_period_ends_at` > `current_period_starts_at` AND (`trial_ends_at` IS NULL OR `trial_ends_at` >= `starts_at`)),
  CONSTRAINT `tenant_subscriptions_effective_key_check` CHECK ((`status` IN ('TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED') AND `effective_key` = 'EFFECTIVE') OR (`status` IN ('CANCELED', 'EXPIRED') AND `effective_key` IS NULL))
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `subscription_history` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `subscription_id` BIGINT UNSIGNED NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `action` VARCHAR(50) NOT NULL,
  `previous_status` ENUM('TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELED', 'EXPIRED') NULL,
  `new_status` ENUM('TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELED', 'EXPIRED') NULL,
  `previous_plan_id` BIGINT UNSIGNED NULL,
  `new_plan_id` BIGINT UNSIGNED NULL,
  `reason` VARCHAR(500) NULL,
  `metadata` JSON NULL,
  `performed_by_user_id` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `subscription_history_public_id_key` (`public_id`),
  KEY `subscription_history_tenant_id_created_at_idx` (`tenant_id`, `created_at`),
  KEY `subscription_history_subscription_id_created_at_idx` (`subscription_id`, `created_at`),
  KEY `subscription_history_action_created_at_idx` (`action`, `created_at`),
  CONSTRAINT `subscription_history_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `tenant_subscriptions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `subscription_history_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `subscription_history_performed_by_user_id_fkey` FOREIGN KEY (`performed_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
