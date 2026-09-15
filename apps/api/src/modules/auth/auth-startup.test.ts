import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.service.js';

import type { IdentityRepository } from './identity.repository.js';
import type { PasswordService } from './password.service.js';

const serverSource = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');

function build({ user = null as unknown }) {
  // Simula o custo real do Argon2: se o startup esperasse por ele, o teste
  // detectaria a espera.
  const hash = vi.fn().mockImplementation(
    () =>
      new Promise<string>((resolvePromise) => {
        setTimeout(() => {
          resolvePromise('dummy');
        }, 60);
      }),
  );
  const verify = vi.fn().mockResolvedValue(false);
  const repository = {
    findUserByNormalizedEmail: vi.fn().mockResolvedValue(user),
    recordAudit: vi.fn().mockResolvedValue(undefined),
  } as unknown as IdentityRepository;
  const service = AuthService.create(
    repository,
    { hash, verify } as unknown as PasswordService,
    { deliver: vi.fn() } as never,
    {
      appWebUrl: 'https://app',
      sessionTtlHours: 12,
      passwordResetTtlMinutes: 60,
      invitationTtlHours: 72,
    } as never,
  );
  return { service, hash, verify, repository };
}

describe('inicialização do AuthService', () => {
  it('constrói sem aguardar o hash dummy do Argon2', () => {
    const { service, hash } = build({});
    // `create` é síncrono e não dispara o hash: nada de Argon2 antes do listen.
    expect(service).toBeInstanceOf(AuthService);
    expect(hash).not.toHaveBeenCalled();
  });

  it('mantém a verificação dummy no login de usuário inexistente', async () => {
    const { service, hash, verify } = build({ user: null });
    await expect(
      service.login(
        { email: 'ninguem@exemplo.com', password: 'qualquer' },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toBeInstanceOf(Error);
    // O hash dummy é gerado sob demanda e comparado, preservando o custo
    // equivalente ao de um usuário real (anti-enumeração).
    expect(hash).toHaveBeenCalledOnce();
    expect(verify).toHaveBeenCalledWith('dummy', 'qualquer');
  });

  it('reaproveita o mesmo hash dummy entre logins', async () => {
    const { service, hash } = build({ user: null });
    await service.login({ email: 'a@b.com', password: 'x' }, { ipAddress: null, userAgent: null })
      .catch(() => undefined);
    await service.login({ email: 'c@d.com', password: 'y' }, { ipAddress: null, userAgent: null })
      .catch(() => undefined);
    expect(hash.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('permite aquecer o hash depois que a API já está ouvindo', async () => {
    const { service } = build({});
    await expect(service.warmUp()).resolves.toBeTypeOf('string');
  });
});

describe('ordem de startup do servidor', () => {
  it('abre a porta antes das tarefas auxiliares', () => {
    const listenAt = serverSource.indexOf('await app.listen(');
    expect(listenAt).toBeGreaterThan(0);
    expect(serverSource.indexOf('void runPostStartTasks(')).toBeGreaterThan(listenAt);
    expect(serverSource.indexOf('worker.stop = startWorker()')).toBeGreaterThan(listenAt);
    // O provisionamento do admin não pode voltar para antes do listen.
    expect(serverSource.indexOf('ensureInitialAdministrator')).toBeGreaterThan(listenAt);
  });

  it('registra a duração de cada etapa do startup', () => {
    for (const stage of [
      'Ambiente carregado',
      'Conexão de banco criada',
      'Aplicação construída',
      'API inicializada',
      'Tarefas pós-início disparadas',
    ])
      expect(serverSource).toContain(stage);
    expect(serverSource).toContain('elapsed');
  });
});
