-- Fase 10R: persistência tenant-level para seleção de provider e assistantConfig.
-- Estratégia expand -> migrate -> code switch. Esta migration é intencionalmente
-- retrocompatível: mantém tenant_whatsapp_configs.assistant_config para o código
-- antigo durante o rollout e não altera credenciais/instâncias W-API existentes.

CREATE TABLE `tenant_whatsapp_settings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `selected_provider` VARCHAR(32) NOT NULL DEFAULT 'WAPI',
  `assistant_config` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `tenant_whatsapp_settings_public_id_key` (`public_id`),
  UNIQUE INDEX `tenant_whatsapp_settings_tenant_id_key` (`tenant_id`),
  INDEX `tenant_whatsapp_settings_selected_provider_idx` (`selected_provider`),
  CONSTRAINT `tenant_whatsapp_settings_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `tenant_whatsapp_settings` (
  `public_id`,
  `tenant_id`,
  `selected_provider`,
  `assistant_config`,
  `created_at`,
  `updated_at`
)
SELECT
  UUID(),
  `tenant_id`,
  COALESCE(NULLIF(`provider`, ''), 'WAPI'),
  `assistant_config`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `tenant_whatsapp_configs`
ON DUPLICATE KEY UPDATE
  `selected_provider` = VALUES(`selected_provider`),
  `assistant_config` = VALUES(`assistant_config`),
  `updated_at` = CURRENT_TIMESTAMP(3);

ALTER TABLE `tenant_whatsapp_configs`
  DROP INDEX `tenant_whatsapp_configs_tenant_id_key`,
  ADD UNIQUE INDEX `tenant_whatsapp_configs_tenant_provider_key` (`tenant_id`, `provider`),
  ADD INDEX `tenant_whatsapp_configs_provider_idx` (`provider`);
