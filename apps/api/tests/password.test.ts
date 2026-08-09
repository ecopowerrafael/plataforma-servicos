import { PasswordSchema } from '@plataforma/shared';
import { describe, expect, it } from 'vitest';

import { PasswordService } from '../src/modules/auth/password.service.js';

const service = new PasswordService({ memoryCost: 19_456, timeCost: 2, parallelism: 1 });

describe('política e hash de senha', () => {
  it.each(['Senha segura 123', ' Frase longa 42 com espaços '])(
    'aceita senha válida',
    (password) => {
      expect(PasswordSchema.safeParse(password).success).toBe(true);
    },
  );

  it.each(['Curta 1', 'Somente letras longas', '          ', 'senha12345', `${'a'.repeat(128)}1`])(
    'rejeita senha inválida',
    (password) => {
      expect(PasswordSchema.safeParse(password).success).toBe(false);
    },
  );

  it('usa Argon2id, verifica corretamente e detecta necessidade de rehash', async () => {
    const password = 'Senha de integração 123';
    const passwordHash = await service.hash(password);

    expect(passwordHash).toMatch(/^\$argon2id\$/u);
    await expect(service.verify(passwordHash, password)).resolves.toBe(true);
    await expect(service.verify(passwordHash, 'Senha incorreta 456')).resolves.toBe(false);
    expect(service.needsRehash(passwordHash)).toBe(false);
    expect(
      new PasswordService({ memoryCost: 19_456, timeCost: 3, parallelism: 1 }).needsRehash(
        passwordHash,
      ),
    ).toBe(true);
  });
});
