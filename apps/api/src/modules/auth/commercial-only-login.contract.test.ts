import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const loginPage = readFileSync(new URL('../../../../web/src/routes/LoginPage.tsx', import.meta.url), 'utf8');
const commercialRoutes = readFileSync(new URL('../commercial/commercial.routes.ts', import.meta.url), 'utf8');

describe('login de usuário somente comercial', () => {
  it('redireciona conta comercial ativa sem tenant ao workspace comercial', () => {
    expect(loginPage).toContain("response.tenants.length === 0");
    expect(loginPage).toContain("httpClient.request('/commercial/me'");
    expect(loginPage).toContain("navigate('/comercial')");
  });

  it('mantém seleção de tenant apenas para múltiplos tenants', () => {
    expect(loginPage).toContain('response.tenants.length === 1');
    expect(loginPage).toContain('await navigate(`/select-tenant${continuation}`);');
  });

  it('resolve conta comercial pela sessão, sem contexto de tenant', () => {
    expect(commercialRoutes).toContain("'/commercial/me'");
    expect(commercialRoutes).toContain('getCommercialScopeForUser(auth.user.id');
    expect(commercialRoutes).not.toContain('tenantContextPlugin');
  });
});
