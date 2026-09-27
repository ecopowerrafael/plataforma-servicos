import { describe, expect, it } from 'vitest';

import { InMemoryTenantRepository } from './helpers/in-memory-tenant.repository.js';
import { TenantService } from '../src/modules/tenants/tenant.service.js';

const defaultSettings = {
  defaultAppointmentIntervalMinutes: 15,
  minimumAdvanceMinutes: 0,
  maximumAdvanceDays: 180,
  allowMultipleUnits: true,
  dateFormat: 'DD/MM/YYYY' as const,
};

describe('allowMultipleUnits validation', () => {
  it('Cenário A: rejeita desativação quando 2 unidades ACTIVE', async () => {
    const repository = new InMemoryTenantRepository();
    const service = new TenantService(repository);

    const { tenant } = await service.createTenant({
      legalName: 'Teste A',
      displayName: 'Teste A',
      slug: 'test-a',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      currency: 'BRL',
      initialUnit: { name: 'Matriz', slug: 'matriz' },
      settings: defaultSettings,
    });

    const tenantContext = (await repository.findTenantByPublicId(tenant.publicId))!;
    const tenantId = tenantContext.id;

    const unit2 = await service.createBusinessUnit(tenantId, tenantContext.timezone, {
      name: 'Filial',
      slug: 'filial',
    });
    expect(unit2.status).toBe('ACTIVE');

    const activeCount = await repository.countActiveBusinessUnits(tenantId);
    expect(activeCount).toBe(2);

    const settings = (await repository.findSettings(tenantId))!;
    await expect(
      service.updateSettings(tenantId, {
        ...settings,
        allowMultipleUnits: false,
      }),
    ).rejects.toMatchObject({
      code: 'TENANT_MULTIPLE_UNITS_ACTIVE',
      statusCode: 409,
    });
  });

  it('Cenário B: permite desativação quando 1 unidade ACTIVE', async () => {
    const repository = new InMemoryTenantRepository();
    const service = new TenantService(repository);

    const { tenant } = await service.createTenant({
      legalName: 'Teste B',
      displayName: 'Teste B',
      slug: 'test-b',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      currency: 'BRL',
      initialUnit: { name: 'Matriz', slug: 'matriz' },
      settings: defaultSettings,
    });

    const tenantId = (await repository.findTenantByPublicId(tenant.publicId))!.id;

    const activeCount = await repository.countActiveBusinessUnits(tenantId);
    expect(activeCount).toBe(1);

    const settings = (await repository.findSettings(tenantId))!;
    const updated = await service.updateSettings(tenantId, {
      ...settings,
      allowMultipleUnits: false,
    });

    expect(updated.allowMultipleUnits).toBe(false);
  });

  it('Cenário C: permite desativação quando 1 ACTIVE + 1 INACTIVE', async () => {
    const repository = new InMemoryTenantRepository();
    const service = new TenantService(repository);

    const { tenant } = await service.createTenant({
      legalName: 'Teste C',
      displayName: 'Teste C',
      slug: 'test-c',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      currency: 'BRL',
      initialUnit: { name: 'Matriz', slug: 'matriz' },
      settings: defaultSettings,
    });

    const tenantContext = (await repository.findTenantByPublicId(tenant.publicId))!;
    const tenantId = tenantContext.id;

    const unit2 = await service.createBusinessUnit(tenantId, tenantContext.timezone, {
      name: 'Filial',
      slug: 'filial',
    });
    expect(unit2.status).toBe('ACTIVE');

    await repository.setBusinessUnitStatus(tenantId, unit2.publicId, false);

    const activeCount = await repository.countActiveBusinessUnits(tenantId);
    expect(activeCount).toBe(1);

    const settings = (await repository.findSettings(tenantId))!;
    const updated = await service.updateSettings(tenantId, {
      ...settings,
      allowMultipleUnits: false,
    });

    expect(updated.allowMultipleUnits).toBe(false);
  });
});
