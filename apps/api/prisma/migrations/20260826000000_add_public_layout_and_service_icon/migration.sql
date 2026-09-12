-- Modelo do aplicativo público (estrutura) separado do tema (identidade visual).
-- Tenants existentes permanecem em CLASSIC pelo DEFAULT.
ALTER TABLE `tenant_public_sites`
  MODIFY COLUMN `theme` ENUM('CLASSIC','MODERN','PREMIUM','LUXURY') NOT NULL DEFAULT 'CLASSIC',
  ADD COLUMN `layout` ENUM('CLASSIC','PREMIUM_APP') NOT NULL DEFAULT 'CLASSIC';

-- Ícone opcional do serviço, usado quando não há imagem cadastrada.
ALTER TABLE `services`
  ADD COLUMN `icon_key` VARCHAR(60) NULL;
