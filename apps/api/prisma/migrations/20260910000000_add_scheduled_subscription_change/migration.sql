ALTER TABLE `tenant_subscriptions`
  ADD COLUMN `scheduled_plan_id` BIGINT UNSIGNED NULL,
  ADD COLUMN `scheduled_billing_cycle` ENUM('MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL') NULL,
  ADD COLUMN `scheduled_effective_at` DATETIME(3) NULL,
  ADD INDEX `ts_scheduled_plan` (`scheduled_plan_id`),
  ADD CONSTRAINT `ts_scheduled_plan_fk`
    FOREIGN KEY (`scheduled_plan_id`) REFERENCES `commercial_plans`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
