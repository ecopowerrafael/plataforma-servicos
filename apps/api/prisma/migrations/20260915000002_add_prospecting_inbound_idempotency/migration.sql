ALTER TABLE `prospecting_messages`
    ADD UNIQUE INDEX `uq_prospecting_message_idempotency_key`(`idempotency_key`);
