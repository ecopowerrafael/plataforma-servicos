-- Marca técnica do bootstrap de conteúdo inicial. Tenants existentes ficam NULL
-- e continuam sem qualquer alteração: o seed só roda para quem entra no
-- onboarding depois desta versão.
ALTER TABLE `tenants`
  ADD COLUMN `starter_content_seeded_at` DATETIME(3) NULL;

-- Guarda quais registros foram gerados pelo sistema, para permitir troca de tipo
-- de negócio durante o onboarding sem tocar em dados do usuário.
ALTER TABLE `tenants`
  ADD COLUMN `starter_content_ids` JSON NULL;
