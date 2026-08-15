import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./professional-self.routes.ts', import.meta.url), 'utf8');

describe('rotas SELF do profissional', () => {
  it('resolve a identidade por usuário autenticado, nunca por professionalPublicId enviado pelo browser', () => {
    expect(source).toContain("'/tenant/professionals/me/agenda'");
    expect(source).toContain('options.professionals.myId(r.tenant.id, r.auth.user.id)');
    expect(source).not.toContain('professionalPublicId: r.query');
  });

  it('protege consulta, notas, status e pagamento pelo appointment do profissional autenticado', () => {
    expect(source.match(/getForProfessional\(/gu)?.length).toBeGreaterThanOrEqual(3);
    expect(source).toContain("'CANCELED'");
    expect(source).toContain("'/tenant/professionals/me/appointments/:publicId/payments'");
  });

  it('não expõe endpoint SELF que selecione outro profissional', () => {
    expect(source).not.toContain('/me/agenda/:professionalPublicId');
    expect(source).not.toContain('/me/commissions/:professionalPublicId');
  });
});
