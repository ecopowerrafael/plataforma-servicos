-- AddColumn treatmentPlanModuleTitle
ALTER TABLE `tenant_terminology` ADD COLUMN `treatment_plan_module_title` VARCHAR(80);

-- AddColumn treatmentPlanSingular
ALTER TABLE `tenant_terminology` ADD COLUMN `treatment_plan_singular` VARCHAR(80);

-- AddColumn treatmentPlanPlural
ALTER TABLE `tenant_terminology` ADD COLUMN `treatment_plan_plural` VARCHAR(80);

-- AddColumn treatmentPlanSessionSingular
ALTER TABLE `tenant_terminology` ADD COLUMN `treatment_plan_session_singular` VARCHAR(80);

-- AddColumn treatmentPlanSessionPlural
ALTER TABLE `tenant_terminology` ADD COLUMN `treatment_plan_session_plural` VARCHAR(80);
