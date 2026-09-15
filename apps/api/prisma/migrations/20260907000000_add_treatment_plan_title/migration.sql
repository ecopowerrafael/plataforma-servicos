-- Titulo do tratamento. Fica nulo para os planos ja existentes e recebe o nome
-- do servico no backfill; a API tambem aplica o mesmo fallback na leitura.
ALTER TABLE `treatment_plans` ADD COLUMN `title` VARCHAR(120) NULL;

UPDATE `treatment_plans` AS `plan`
  JOIN `services` AS `service` ON `service`.`id` = `plan`.`service_id`
  SET `plan`.`title` = LEFT(`service`.`name`, 120)
  WHERE `plan`.`title` IS NULL;
