import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('permissões das rotas de agendamento', () => {
  it('protege leitura, criação, edição e transições de status', async () => {
    const source = await readFile(
      new URL('../src/modules/appointments/appointment.routes.ts', import.meta.url),
      'utf8',
    );
    for (const permission of [
      'appointment.read',
      'appointment.create',
      'appointment.update',
      'appointment.status.manage',
    ])
      expect(source).toContain(`requirePermission(r.tenant, '${permission}')`);
  });
});
