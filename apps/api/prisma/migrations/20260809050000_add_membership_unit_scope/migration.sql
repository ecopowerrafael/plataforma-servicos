ALTER TABLE `tenant_memberships` ADD COLUMN `all_units` BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE `tenant_membership_units` (
  `membership_id` BIGINT UNSIGNED NOT NULL,
  `unit_id` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`membership_id`, `unit_id`),
  INDEX `tenant_membership_units_unit_id_idx` (`unit_id`),
  CONSTRAINT `tenant_membership_units_membership_id_fkey` FOREIGN KEY (`membership_id`) REFERENCES `tenant_memberships` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `tenant_membership_units_unit_id_fkey` FOREIGN KEY (`unit_id`) REFERENCES `business_units` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
