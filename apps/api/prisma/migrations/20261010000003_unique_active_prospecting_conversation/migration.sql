-- Garante um único contexto de atendimento por contato, instância e status.
-- A combinação inclui status para preservar o histórico CLOSED/MANUAL.
ALTER TABLE `prospecting_conversations`
  ADD UNIQUE INDEX `uq_prospecting_conversation_contact_instance_status`
    (`contact_id`, `instance_id`, `status`);
