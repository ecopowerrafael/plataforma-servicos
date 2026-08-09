ALTER TABLE `professionals`
  ADD COLUMN `user_id` BIGINT UNSIGNED NULL AFTER `primary_unit_id`,
  ADD UNIQUE INDEX `professionals_tenant_id_user_id_key` (`tenant_id`, `user_id`),
  ADD CONSTRAINT `professionals_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
