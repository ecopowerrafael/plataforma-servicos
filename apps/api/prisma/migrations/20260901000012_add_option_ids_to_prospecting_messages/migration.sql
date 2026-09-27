-- Add optionIds field to store snapshot of option IDs in order they were sent
-- This enables deterministic resolution of button clicks via selectedIndex,
-- independent of flow changes after message was sent.
ALTER TABLE `prospecting_messages` ADD COLUMN `option_ids` JSON NULL;
