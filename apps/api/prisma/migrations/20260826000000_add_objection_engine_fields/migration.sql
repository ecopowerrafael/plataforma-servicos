-- Add code field to ProspectingObjection (unique, for idempotent seeding)
ALTER TABLE prospecting_objections
ADD COLUMN code VARCHAR(100) UNIQUE NULL AFTER public_id;

-- Add suggestedResponse field to ProspectingObjection
ALTER TABLE prospecting_objections
ADD COLUMN suggested_response TEXT NULL AFTER description;

-- Add objectionId FK to ProspectingMessage
ALTER TABLE prospecting_messages
ADD COLUMN objection_id BIGINT UNSIGNED NULL AFTER template_id;

-- Add classifiedAt timestamp to ProspectingMessage
ALTER TABLE prospecting_messages
ADD COLUMN classified_at DATETIME(3) NULL AFTER sending_started_at;

-- Add foreign key constraint
ALTER TABLE prospecting_messages
ADD CONSTRAINT fk_prospecting_messages_objection_id
FOREIGN KEY (objection_id) REFERENCES prospecting_objections(id) ON DELETE SET NULL;

-- Add index for objection queries
CREATE INDEX idx_prospecting_messages_objection_classified
ON prospecting_messages(objection_id, classified_at);
