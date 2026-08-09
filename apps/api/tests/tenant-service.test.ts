import { CreateTenantRequestSchema } from '@plataforma/shared';
import { describe, expect, it } from 'vitest';

import { InMemoryTenantRepository } from './helpers/in-memory-tenant.repository.js';
import { TenantService } from '../src/modules/tenants/tenant.service.js';

const request = CreateTenantRequestSchema.parse({
  legalName: 'Empresa Exemplo Ltda.',
  displayName: 'Empresa Exemplo',
  slug: 'empresa-exemplo',
  timezone: 'America/Sao_Paulo',
  locale: 'pt-BR',
  currency: 'BRL',
  initialUnit: { name: 'Matriz', slug: 'matriz' },
});

describe('criação de tenant', () => {
  it('cria tenant, configurações e matriz como uma única estrutura', async () => {
    const repository = new InMemoryTenantRepository();
    const result = await new TenantService(repository).createTenant(request);

    expect(repository.counts).toEqual({ tenants: 1, settings: 1, units: 1 });
    expect(result.tenant.status).toBe('ACTIVE');
    expect(result.initialUnit).toMatchObject({
      status: 'ACTIVE',
      isHeadquarters: true,
      timezone: request.timezone,
    });
    expect(result.tenant.publicId).not.toBe(result.initialUnit.publicId);
  });

  it('não deixa registros parciais quando a transação falha', async () => {
    const repository = new InMemoryTenantRepository();
    repository.failBeforeCommit = true;

    await expect(new TenantService(repository).createTenant(request)).rejects.toThrow(
      'controlled transaction failure',
    );
    expect(repository.counts).toEqual({ tenants: 0, settings: 0, units: 0 });
  });

  it('traduz conflito de slug global em erro de domínio', async () => {
    const repository = new InMemoryTenantRepository();
    const service = new TenantService(repository);
    await service.createTenant(request);

    await expect(service.createTenant(request)).rejects.toMatchObject({
      code: 'TENANT_SLUG_CONFLICT',
      statusCode: 409,
    });
  });
});
