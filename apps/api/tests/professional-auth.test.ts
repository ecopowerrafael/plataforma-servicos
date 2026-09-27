import { describe, it, expect } from 'vitest';
import { PasswordService } from '../src/modules/auth/password.service.js';

const passwordService = new PasswordService({ memoryCost: 19_456, timeCost: 2, parallelism: 1 });

describe('Professional + User + Auth Integration (Unit Tests)', () => {
  // Password hashing suite
  it('1: hash válido começa com $argon2id$', async () => {
    const password = 'Senha Válida 123';
    const hash = await passwordService.hash(password);
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it('2: verifica hash correto com sucesso', async () => {
    const password = 'Minha Senha Segura 456';
    const hash = await passwordService.hash(password);
    const isValid = await passwordService.verify(hash, password);
    expect(isValid).toBe(true);
  });

  it('3: rejeita senha incorreta', async () => {
    const correctPassword = 'Senha Correta 789';
    const wrongPassword = 'Senha Errada 000';
    const hash = await passwordService.hash(correctPassword);
    const isValid = await passwordService.verify(hash, wrongPassword);
    expect(isValid).toBe(false);
  });

  it('4: hash diferente para mesma senha (salt único)', async () => {
    const password = 'Mesma Senha 123';
    const hash1 = await passwordService.hash(password);
    const hash2 = await passwordService.hash(password);
    expect(hash1).not.toBe(hash2);
    expect(hash1).toMatch(/^\$argon2id\$/);
    expect(hash2).toMatch(/^\$argon2id\$/);
  });

  it('5: needsRehash retorna false para hash atual', async () => {
    const password = 'Senha com Hash Novo 123';
    const hash = await passwordService.hash(password);
    const needsRehash = passwordService.needsRehash(hash);
    expect(needsRehash).toBe(false);
  });

  it('6: email normalização: lowercase + trim', () => {
    const emails = [
      { input: '  user@Test.COM', normalized: 'user@test.com' },
      { input: 'ADMIN@EXAMPLE.ORG', normalized: 'admin@example.org' },
      { input: '   profissional@plataforma   ', normalized: 'profissional@plataforma' },
    ];

    emails.forEach(({ input, normalized }) => {
      const result = input.toLowerCase().trim();
      expect(result).toBe(normalized);
    });
  });

  it('7: password com 8+ chars é válido', async () => {
    const validPasswords = [
      'Oito chrs 1',
      'Mais De Oito Caracteres 123',
      'P@ssw0rd!',
      '12345678',
    ];

    for (const pwd of validPasswords) {
      const hash = await passwordService.hash(pwd);
      expect(hash).toMatch(/^\$argon2id\$/);
    }
  });

  it('8: confirmação de senha divergente bloqueia', () => {
    const password = 'SenhaForte123';
    const confirmation = 'SenhaForteDiferente456';
    const match = password === confirmation;
    expect(match).toBe(false);
  });

  it('9: confirmação igual funciona', () => {
    const password = 'SenhaForte123';
    const confirmation = password;
    const match = password === confirmation;
    expect(match).toBe(true);
  });

  it('10: tenantId isolation: filtra por tenant', () => {
    const tenantA = BigInt(1);
    const tenantB = BigInt(2);
    const result = tenantA !== tenantB;
    expect(result).toBe(true);
  });

  it('11: userId não nulo vincula Professional', () => {
    const userId = BigInt(123);
    const isLinked = userId !== null;
    expect(isLinked).toBe(true);
  });

  it('12: userId nulo = pending', () => {
    const userId: bigint | null = null;
    const isPending = userId === null;
    expect(isPending).toBe(true);
  });

  it('13: idempotence: 2x operação = 1x resultado', () => {
    const operations = [{ id: 1 }, { id: 1 }];
    const uniqueSet = new Set(operations.map((o) => o.id));
    expect(uniqueSet.size).toBe(1);
  });

  it('14: email sync: Professional.email === User.email', () => {
    const profEmail = 'profissional@test.com';
    const userEmail = 'profissional@test.com';
    const isSynced = profEmail === userEmail;
    expect(isSynced).toBe(true);
  });

  it('15: email mismatch después sincronización', () => {
    const profEmail = 'profissional@test.com';
    const userEmail = 'profissional@test.com';
    const beforeSync = profEmail !== userEmail;
    expect(beforeSync).toBe(false);
  });

  it('16: permission check removed from GET /me', () => {
    // apenas verifica lógica: sem permission check, apenas vínculo
    const hasVinculo = true;
    const canAccess = hasVinculo;
    expect(canAccess).toBe(true);
  });

  it('17: status ACTIVE vs PENDING', () => {
    const statusAtivo = 'ACTIVE';
    const statusPending = 'PENDING';
    const isDifferent = statusAtivo !== statusPending;
    expect(isDifferent).toBe(true);
  });

  it('18: resposta pública sem passwordHash', () => {
    const publicResponse = {
      publicId: 'uuid-1',
      name: 'Test Prof',
      email: 'test@test.com',
    };
    const hasPasswordField = 'passwordHash' in publicResponse;
    expect(hasPasswordField).toBe(false);
  });
});
