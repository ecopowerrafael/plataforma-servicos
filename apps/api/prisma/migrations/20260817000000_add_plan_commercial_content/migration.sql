ALTER TABLE `commercial_plans`
  ADD COLUMN `subtitle` VARCHAR(160) NULL AFTER `name`,
  ADD COLUMN `short_description` VARCHAR(240) NULL AFTER `subtitle`,
  ADD COLUMN `highlighted` BOOLEAN NOT NULL DEFAULT false AFTER `is_public`,
  ADD COLUMN `badge` VARCHAR(40) NULL AFTER `highlighted`,
  ADD COLUMN `cta_text` VARCHAR(60) NULL AFTER `badge`;

CREATE TABLE `plan_benefits` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `plan_id` BIGINT UNSIGNED NOT NULL,
  `text` VARCHAR(160) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `plan_benefits_public_id_key` (`public_id`),
  INDEX `plan_benefits_plan_id_sort_order_idx` (`plan_id`, `sort_order`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `plan_benefits`
  ADD CONSTRAINT `plan_benefits_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `commercial_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
