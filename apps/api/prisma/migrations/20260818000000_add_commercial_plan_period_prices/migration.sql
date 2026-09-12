ALTER TABLE `commercial_plans`
  ADD COLUMN `monthly_price_cents` BIGINT UNSIGNED NULL,
  ADD COLUMN `annual_price_cents` BIGINT UNSIGNED NULL;

UPDATE `commercial_plans`
SET `monthly_price_cents` = `price_cents`
WHERE `billing_cycle` = 'MONTHLY' AND `monthly_price_cents` IS NULL;

UPDATE `commercial_plans`
SET `annual_price_cents` = `price_cents`
WHERE `billing_cycle` = 'ANNUAL' AND `annual_price_cents` IS NULL;
