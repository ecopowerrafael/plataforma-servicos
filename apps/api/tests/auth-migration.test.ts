import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  '../prisma/migrations/20260804060000_create_authentication_and_authorization/migration.sql',
  import.meta.url,
);
const bootstrapUrl = new URL('../src/database/bootstrap.ts', import.meta.url);

describe('estrutura persistente de identidade', () => {
  it('cria todas as tabelas, índices, hashes e restrições de isolamento', async () => {
    const sql = await readFile(migrationUrl, 'utf8');
    for (const table of [
      'users',
      'tenant_memberships',
      'roles',
      'permissions',
      'role_permissions',
      'user_sessions',
      'password_reset_tokens',
      'user_invitations',
      'audit_logs',
    ])
      expect(sql).toContain(`CREATE TABLE \`${table}\``);

    expect(sql).toContain('UNIQUE INDEX `users_normalized_email_key`');
    expect(sql).toContain('UNIQUE INDEX `user_sessions_token_hash_key`');
    expect(sql).toContain('tenant_memberships_one_owner_per_tenant');
    expect(sql).toContain('user_invitations_one_pending_per_tenant_email');
    expect(sql).toContain('ON DELETE RESTRICT ON UPDATE CASCADE');
    expect(sql).not.toContain('ON DELETE CASCADE');
  });

  it('inicializa papéis e permissões de forma idempotente sem credenciais', async () => {
    const source = await readFile(bootstrapUrl, 'utf8');
    expect(source).toContain("code: 'OWNER'");
    expect(source).toContain("code: 'MANAGER'");
    expect(source).toContain("code: 'RECEPTIONIST'");
    expect(source).toContain("code: 'PROFESSIONAL'");
    expect(source).toContain('permission.upsert');
    expect(source).toContain('role.upsert');
    expect(source).toContain('skipDuplicates: true');
    expect(source).not.toContain('passwordHash');
  });
});
