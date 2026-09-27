import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../../../prisma/migrations/20260824000000_repair_tenant_white_label_tables/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('tenant white-label repair migration', () => {
  it('repairs each optional white-label table without changing existing data', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS `tenant_branding`');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS `tenant_terminology`');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS `tenant_public_sites`');
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b|\bTRUNCATE\s+TABLE\b/i);
  });
});
