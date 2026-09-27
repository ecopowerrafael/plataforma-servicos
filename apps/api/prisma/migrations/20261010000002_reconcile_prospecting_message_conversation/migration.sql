-- Reconcile databases where the attendant migration was recorded as applied
-- before conversation_id was included in prospecting_messages.
ALTER TABLE `prospecting_messages`
  ADD COLUMN IF NOT EXISTS `conversation_id` BIGINT UNSIGNED NULL,
  ADD INDEX IF NOT EXISTS `prospecting_messages_conversation_id_created_at_idx` (`conversation_id`, `created_at`);

SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'prospecting_messages'
    AND COLUMN_NAME = 'conversation_id'
    AND CONSTRAINT_NAME = 'prospecting_messages_conversation_id_fkey'
);
SET @fk_sql := IF(
  @fk_exists = 0,
  'ALTER TABLE `prospecting_messages` ADD CONSTRAINT `prospecting_messages_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `prospecting_conversations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE add_prospecting_message_conversation_fk FROM @fk_sql;
EXECUTE add_prospecting_message_conversation_fk;
DEALLOCATE PREPARE add_prospecting_message_conversation_fk;

UPDATE `prospecting_messages` m
JOIN `prospecting_leads` l ON l.id = m.lead_id
JOIN `prospecting_contacts` c ON c.normalized_phone = l.normalized_phone
JOIN `prospecting_conversations` v ON v.contact_id = c.id
SET m.conversation_id = v.id
WHERE m.conversation_id IS NULL;
