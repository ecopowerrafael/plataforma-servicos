ALTER TABLE `prospecting_flow_steps`
  ADD COLUMN `code` VARCHAR(100) NULL AFTER `name`;

CREATE UNIQUE INDEX `prospecting_flow_steps_flow_id_code_key`
  ON `prospecting_flow_steps` (`flow_id`, `code`);
