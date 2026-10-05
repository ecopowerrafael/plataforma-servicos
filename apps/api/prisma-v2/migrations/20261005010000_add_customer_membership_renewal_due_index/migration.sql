ALTER TABLE `customer_memberships`
  ADD INDEX `customer_memberships_status_next_billing_at_id_idx` (`status`, `next_billing_at`, `id`);
