ALTER TABLE `prospecting_flows`
  ADD COLUMN `purpose` VARCHAR(20) NOT NULL DEFAULT 'CAMPAIGN' AFTER `is_active`;

CREATE INDEX `prospecting_flows_purpose_active_idx`
  ON `prospecting_flows` (`purpose`, `is_active`);
