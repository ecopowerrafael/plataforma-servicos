-- Provisionamento automatico da instancia de WhatsApp pelo painel.
-- As colunas antigas (phone_number_id = instanceId, encrypted_access_token =
-- token da instancia) continuam sendo a credencial usada pelo Assistant.
ALTER TABLE `tenant_whatsapp_configs`
  ADD COLUMN `provider` VARCHAR(32) NOT NULL DEFAULT 'WAPI',
  ADD COLUMN `instance_name` VARCHAR(120) NULL,
  ADD COLUMN `connection_status` VARCHAR(24) NOT NULL DEFAULT 'NOT_CREATED',
  ADD COLUMN `connected_phone` VARCHAR(32) NULL,
  ADD COLUMN `connected_name` VARCHAR(120) NULL,
  ADD COLUMN `connected_at` DATETIME(3) NULL,
  ADD COLUMN `last_status_check_at` DATETIME(3) NULL;

-- Tenants ja configurados manualmente mantem a instancia: entram como
-- existente (CREATED) e, quando o painel consultar o provedor, o status real
-- passa a valer. Quem ja tinha conexao validada entra direto como CONNECTED.
UPDATE `tenant_whatsapp_configs`
  SET `connection_status` = CASE
    WHEN `last_validation_status` = 'CONNECTED' THEN 'CONNECTED'
    ELSE 'CREATED'
  END
  WHERE `phone_number_id` <> '';
