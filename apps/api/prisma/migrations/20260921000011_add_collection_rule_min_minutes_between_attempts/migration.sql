-- Bot Cobra Fase 8: Cadência de tentativas — intervalo mínimo entre mensagens automáticas.

ALTER TABLE `collection_rules`
  ADD COLUMN `min_minutes_between_attempts` SMALLINT UNSIGNED NOT NULL DEFAULT 120;

-- Validação: intervalo deve estar entre 15 e 1440 minutos (1 dia).
-- Aplicado em decideNextAttempt() — não há constraint no banco.
