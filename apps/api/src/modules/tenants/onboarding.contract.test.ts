import { PasswordSchema, passwordRequirementStatus, TenantSlugSchema } from '@plataforma/shared';
import { describe, expect, it } from 'vitest';

describe('onboarding contracts', () => {
  it('explains the real password rule instead of returning a generic validation error', () => {
    const result = PasswordSchema.safeParse('curta1');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).toBe('A senha deve possuir pelo menos 10 caracteres.');
  });

  it('accepts a slug normalized for the public address', () => {
    expect(TenantSlugSchema.parse('barbearia-silva')).toBe('barbearia-silva');
  });

  it('rejects a reserved public address', () => {
    expect(TenantSlugSchema.safeParse('app').success).toBe(false);
  });

  it('exposes the same password requirement state consumed by the registration interface', () => {
    expect(passwordRequirementStatus('SenhaSegura123!')).toEqual({
      minLength: true,
      maxLength: true,
      letter: true,
      number: true,
      notOnlyWhitespace: true,
      notCommon: true,
    });
    expect(passwordRequirementStatus('senha12345').notCommon).toBe(false);
  });
});
