-- Modelo operacional do estabelecimento: cobrança por serviço (atual) ou mensalidade.
-- Todo tenant existente permanece em SERVICE_PRICING; a escolha passa a existir no onboarding.
ALTER TABLE `tenants`
  ADD COLUMN `operating_model` ENUM('SERVICE_PRICING', 'MEMBERSHIP') NOT NULL DEFAULT 'SERVICE_PRICING';

UPDATE `tenants` SET `operating_model` = 'SERVICE_PRICING' WHERE `operating_model` IS NULL;
