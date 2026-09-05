import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { buildDatabaseUrl } from '../config/database-url.js';

const source = readFileSync(new URL('./recover-failed-migrations.ts', import.meta.url), 'utf8');

describe('recuperação de migrations com falha', () => {
  it('resolve a conexão pelos DB_* quando não existe DATABASE_URL, como em produção', () => {
    const url = buildDatabaseUrl({
      DB_HOST: 'localhost',
      DB_PORT: '3306',
      DB_NAME: 'plataforma',
      DB_USER: 'app_user',
      DB_PASSWORD: 'senha forte',
      DB_CONNECTION_LIMIT: '10',
    });
    expect(url).toBe(
      'mysql://app_user:senha%20forte@localhost:3306/plataforma?connection_limit=10',
    );
  });

  it('mantém a prioridade de DATABASE_URL quando ela existe', () => {
    expect(
      buildDatabaseUrl({
        DATABASE_URL: 'mysql://direta@127.0.0.1:3307/db',
        DB_NAME: 'outro',
        DB_USER: 'outro',
      }),
    ).toBe('mysql://direta@127.0.0.1:3307/db');
  });

  it('usa o helper compartilhado e repassa a URL resolvida para a CLI do Prisma', () => {
    expect(source).toContain('buildDatabaseUrl(process.env)');
    expect(source).toContain('DATABASE_URL: url');
    expect(source).not.toContain('const url = process.env.DATABASE_URL');
  });

  it('nunca marca a migration como aplicada nem reseta o banco', () => {
    expect(source).toContain("'--rolled-back'");
    expect(source).not.toContain('--applied');
    expect(source).not.toContain('migrate reset');
    expect(source).not.toContain('DROP');
  });
});
