-- Add autoReplyEnabled to ProspectingCampaign
ALTER TABLE prospecting_campaigns
ADD COLUMN auto_reply_enabled BOOLEAN NOT NULL DEFAULT FALSE AFTER pause_on_interest;

-- Add autoReplyAllowed to ProspectingObjection
ALTER TABLE prospecting_objections
ADD COLUMN auto_reply_allowed BOOLEAN NOT NULL DEFAULT FALSE AFTER suggested_response;

-- Add fields to ProspectingMessage for auto-reply scheduling
ALTER TABLE prospecting_messages
ADD COLUMN purpose VARCHAR(50) DEFAULT 'CAMPAIGN' AFTER objection_id;

ALTER TABLE prospecting_messages
ADD COLUMN scheduled_at DATETIME(3) NULL AFTER classified_at;

ALTER TABLE prospecting_messages
ADD COLUMN next_attempt_at DATETIME(3) NULL AFTER scheduled_at;

ALTER TABLE prospecting_messages
ADD COLUMN reply_to_message_id BIGINT UNSIGNED NULL AFTER next_attempt_at;

ALTER TABLE prospecting_messages
ADD COLUMN cancel_reason VARCHAR(500) NULL AFTER reply_to_message_id;

-- Add foreign key for reply_to_message_id
ALTER TABLE prospecting_messages
ADD CONSTRAINT fk_prospecting_messages_reply_to
FOREIGN KEY (reply_to_message_id) REFERENCES prospecting_messages(id) ON DELETE SET NULL;

-- Add nextSendAt to ProspectingWhatsAppConfig for global instance rate-limit
ALTER TABLE prospecting_whatsapp_configs
ADD COLUMN next_send_at DATETIME(3) NULL AFTER last_checked_at;

-- Add index for Worker to find pending auto-replies (MariaDB: partial indexes not supported, using normal index)
-- Purpose, status, and next_attempt_at are naturally filtered by Worker queries
CREATE INDEX idx_prospecting_messages_pending_auto_reply
ON prospecting_messages(purpose, status, next_attempt_at);
