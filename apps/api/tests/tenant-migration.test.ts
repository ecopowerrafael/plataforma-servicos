import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  '../prisma/migrations/20260804030000_create_tenant_foundation/migration.sql',
  import.meta.url,
);

describe('garantias estruturais da migration multiempresa', () => {
  it('protege unicidade, matriz única, integridade e domínio dos dados', async () => {
    const sql = await readFile(migrationUrl, 'utf8');

    expect(sql).toContain('UNIQUE INDEX `tenants_public_id_key`');
    expect(sql).toContain('UNIQUE INDEX `tenants_slug_key`');
    expect(sql).toContain('UNIQUE INDEX `business_units_tenant_id_slug_key`');
    expect(sql).not.toContain('headquarters_key');
    expect(sql).not.toContain('CREATE TRIGGER');
    expect(sql).not.toContain('GENERATED ALWAYS');
    expect(sql).toContain('ON DELETE RESTRICT ON UPDATE CASCADE');
    expect(sql).toContain(
      'CHECK (`default_appointment_interval_minutes` IN (5, 10, 15, 20, 30, 60))',
    );
  });
});
