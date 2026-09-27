-- Memberships canceladas/expiradas preservam histórico e não impedem nova contratação.
-- A unicidade dos estados relevantes é protegida por active_key.
ALTER TABLE `customer_memberships`
  DROP INDEX `customer_memberships_tenant_id_customer_id_key`;
