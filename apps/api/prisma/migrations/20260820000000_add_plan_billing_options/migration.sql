CREATE TABLE `plan_billing_options` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `plan_id` BIGINT UNSIGNED NOT NULL,
  `billing_cycle` ENUM('MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'CUSTOM') NOT NULL,
  `price_cents` BIGINT UNSIGNED NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `sort_order` INT NOT NULL DEFAULT 0,
  `recommended` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `plan_billing_options_public_id_key` (`public_id`),
  UNIQUE INDEX `plan_billing_options_plan_id_billing_cycle_key` (`plan_id`, `billing_cycle`),
  INDEX `plan_billing_options_plan_id_active_sort_order_idx` (`plan_id`, `active`, `sort_order`),
  CONSTRAINT `plan_billing_options_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `commercial_plans` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (`id`)
);

INSERT INTO `plan_billing_options` (`public_id`, `plan_id`, `billing_cycle`, `price_cents`, `active`, `sort_order`, `recommended`)
SELECT UUID(), `id`, 'MONTHLY', COALESCE(`monthly_price_cents`, `price_cents`), true, 0, true
FROM `commercial_plans`
WHERE `billing_cycle` = 'MONTHLY' OR `monthly_price_cents` IS NOT NULL;

INSERT INTO `plan_billing_options` (`public_id`, `plan_id`, `billing_cycle`, `price_cents`, `active`, `sort_order`, `recommended`)
SELECT UUID(), `id`, 'ANNUAL', COALESCE(`annual_price_cents`, `price_cents`), true, 3, false
FROM `commercial_plans`
WHERE (`billing_cycle` = 'ANNUAL' OR `annual_price_cents` IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM `plan_billing_options` WHERE `plan_id` = `commercial_plans`.`id` AND `billing_cycle` = 'ANNUAL');
