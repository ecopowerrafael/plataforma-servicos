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
    expect(sql).toContain('business_units_one_headquarters_per_tenant');
    expect(sql).toContain('`headquarters_key` BIGINT UNSIGNED NULL');
    expect(sql).toContain('CREATE TRIGGER `business_units_headquarters_before_insert`');
    expect(sql).toContain('CREATE TRIGGER `business_units_headquarters_before_update`');
    expect(sql).toContain('SET NEW.`headquarters_key` = IF(NEW.`is_headquarters` = 1, NEW.`tenant_id`, NULL)');
    expect(sql).not.toContain('GENERATED ALWAYS');
    expect(sql).toContain('ON DELETE RESTRICT ON UPDATE CASCADE');
    expect(sql).toContain(
      'CHECK (`default_appointment_interval_minutes` IN (5, 10, 15, 20, 30, 60))',
    );
  });
});
