-- Production Fix: Add missing commercial platform permissions
-- Apply this AFTER deploying the code changes
-- Backup database BEFORE running

-- Add missing permissions to permission catalog
INSERT IGNORE INTO `platform_permissions` (`name`, `description`)
VALUES
  ('platform.commercial.read', 'Consultar hierarquia comercial, comissões e pagamentos.'),
  ('platform.commercial.manage', 'Gerenciar gerentes, representantes, vendedores, comissões e pagamentos comerciais.');

-- Grant permissions to existing Administrador Global role
-- First, get the role id (usually 'ADMIN' or similar)
-- SELECT id FROM `platform_roles` WHERE code = 'ADMIN' OR role = 'ADMIN';

-- Assuming role_id exists, grant permissions:
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_name`)
SELECT
  pr.id,
  pp.name
FROM `platform_roles` pr, `platform_permissions` pp
WHERE (pr.code = 'ADMIN' OR pr.role = 'ADMIN')
  AND pp.name IN ('platform.commercial.read', 'platform.commercial.manage');

-- Verify permissions were added
SELECT 'Commercial permissions added:' AS status;
SELECT pp.name, COUNT(rp.permission_name) as granted_to_roles
FROM `platform_permissions` pp
LEFT JOIN `role_permissions` rp ON pp.name = rp.permission_name
WHERE pp.name LIKE 'platform.commercial.%'
GROUP BY pp.name;
