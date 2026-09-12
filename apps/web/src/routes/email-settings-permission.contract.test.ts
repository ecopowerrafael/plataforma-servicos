import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const homePageSource = readFileSync(new URL('./HomePage.tsx', import.meta.url), 'utf8');
const emailTemplateSource = readFileSync(
  new URL('../components/tenants/EmailTemplateModule.tsx', import.meta.url),
  'utf8',
);
const bootstrapSource = readFileSync(
  new URL('../../../../apps/api/src/database/bootstrap.ts', import.meta.url),
  'utf8',
);
const notificationRoutesSource = readFileSync(
  new URL('../../../../apps/api/src/modules/notifications/notification-template.routes.ts', import.meta.url),
  'utf8',
);

describe('email settings notification permission contract', () => {
  it('renders /app/configuracoes/emails with read permission and passes the real manage permission', () => {
    expect(homePageSource).toContain("isRoute('/app/configuracoes/emails') && canViewNotifications");
    expect(homePageSource).toContain("permissions.includes('notification.read')");
    expect(homePageSource).toContain("permissions.includes('notification.template.manage')");
    expect(homePageSource).toContain('canManage={canManageNotificationTemplates}');
    expect(homePageSource).not.toContain('canManage={canManageNotifications}');
  });

  it('does not leave canManageNotifications as an undeclared runtime identifier', () => {
    expect(homePageSource).not.toMatch(/\bcanManageNotifications\b/);
  });

  it('keeps read and edit permissions aligned with backend RBAC', () => {
    expect(notificationRoutesSource).toContain("requirePermission(r.tenant, 'notification.read')");
    expect(notificationRoutesSource).toContain(
      "requirePermission(r.tenant, 'notification.template.manage')",
    );
    expect(emailTemplateSource).toContain('canManage: boolean');
    expect(emailTemplateSource).toContain('canManage={canManage}');
  });

  it('keeps OWNER and MANAGER able to manage notification templates and PROFESSIONAL without access', () => {
    const ownerStart = bootstrapSource.indexOf("code: 'OWNER'");
    const managerStart = bootstrapSource.indexOf("code: 'MANAGER'");
    const professionalStart = bootstrapSource.indexOf("code: 'PROFESSIONAL'");
    const receptionistStart = bootstrapSource.indexOf("code: 'RECEPTIONIST'");
    const ownerBlock = bootstrapSource.slice(ownerStart, managerStart);
    const managerBlock = bootstrapSource.slice(managerStart, receptionistStart);
    const professionalBlock = bootstrapSource.slice(professionalStart);

    expect(ownerBlock).toContain('permissions: permissions.map(([code]) => code)');
    expect(managerBlock).toContain("'notification.read'");
    expect(managerBlock).toContain("'notification.template.manage'");
    expect(professionalBlock).not.toContain("'notification.read'");
    expect(professionalBlock).not.toContain("'notification.template.manage'");
  });
});
