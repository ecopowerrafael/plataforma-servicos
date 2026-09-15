import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./commercial.routes.ts', import.meta.url), 'utf8');

describe('rotas comerciais autenticadas sem tenant', () => {
  it('registra autenticação de sessão antes de resolver a conta comercial', () => {
    expect(source).toContain('await app.register(authenticationPlugin');
    expect(source).toContain('cookieName: options.cookieName');
    expect(source).toContain("'/commercial/me'");
    expect(source).toContain('getCommercialScopeForUser(auth.user.id');
  });

  it('não registra o contexto de tenant nas rotas comerciais', () => {
    expect(source).not.toContain('tenantContextPlugin');
  });
});
