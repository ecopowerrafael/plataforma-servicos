ALTER TABLE `tenants`
  ADD COLUMN `business_type_custom` VARCHAR(120) NULL AFTER `business_profile`,
  ADD COLUMN `onboarding_step` VARCHAR(40) NOT NULL DEFAULT 'WELCOME' AFTER `business_type_custom`,
  ADD COLUMN `onboarding_completed_at` DATETIME(3) NULL AFTER `onboarding_step`,
  ADD COLUMN `onboarding_checklist_hidden_at` DATETIME(3) NULL AFTER `onboarding_completed_at`;
