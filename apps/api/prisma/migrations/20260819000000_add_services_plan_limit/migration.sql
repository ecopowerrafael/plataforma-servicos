ALTER TABLE `plan_limits`
  DROP CONSTRAINT `plan_limits_key_check`;

ALTER TABLE `plan_limits`
  ADD CONSTRAINT `plan_limits_key_check`
  CHECK (`key` IN ('units.max', 'members.max', 'professionals.max', 'services.max', 'monthly_appointments.max', 'storage.megabytes', 'branding.customization.enabled', 'custom_domain.enabled', 'advanced_reports.enabled', 'priority_support.enabled'));
