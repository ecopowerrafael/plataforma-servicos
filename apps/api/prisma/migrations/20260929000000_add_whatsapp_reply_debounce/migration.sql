ALTER TABLE `whatsapp_conversations`
  ADD COLUMN `pending_reply_at` datetime(3) NULL,
  ADD COLUMN `pending_reply_event_id` bigint unsigned NULL,
  ADD COLUMN `reply_processing_at` datetime(3) NULL,
  ADD COLUMN `reply_processing_token` varchar(80) NULL,
  ADD KEY `whatsapp_conversations_pending_reply_idx` (`pending_reply_at`),
  ADD KEY `whatsapp_conversations_pending_reply_event_idx` (`pending_reply_event_id`);
