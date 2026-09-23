ALTER TABLE `plan_billing_options`
  ADD COLUMN `stripe_price_id` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `plan_billing_options_stripe_price_id_key` (`stripe_price_id`);

ALTER TABLE `tenant_subscriptions`
  ADD COLUMN `billing_provider` VARCHAR(32) NULL,
  ADD COLUMN `stripe_customer_id` VARCHAR(191) NULL,
  ADD COLUMN `stripe_subscription_id` VARCHAR(191) NULL,
  ADD COLUMN `stripe_price_id` VARCHAR(191) NULL,
  ADD COLUMN `cancel_at_period_end` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `last_payment_at` DATETIME(3) NULL,
  ADD COLUMN `last_stripe_event_at` DATETIME(3) NULL,
  ADD UNIQUE INDEX `tenant_subscriptions_stripe_subscription_id_key` (`stripe_subscription_id`);

CREATE TABLE `stripe_webhook_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `external_event_id` VARCHAR(191) NOT NULL,
  `event_type` VARCHAR(80) NOT NULL,
  `processing_status` VARCHAR(32) NOT NULL DEFAULT 'RECEIVED',
  `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `processed_at` DATETIME(3) NULL,
  `last_error` TEXT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `stripe_webhook_events_external_event_id_key` (`external_event_id`),
  INDEX `stripe_webhook_events_processing_status_received_at_idx` (`processing_status`, `received_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
