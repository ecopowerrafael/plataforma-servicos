import { randomUUID } from 'node:crypto';

import { CreateCustomerFavoriteRequestSchema } from '@plataforma/shared';
import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { CustomerFavoriteRepository } from '../src/modules/customers/customer-favorite.repository.js';
import { CustomerFavoriteService } from '../src/modules/customers/customer-favorite.service.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;

describe.skipIf(url === undefined)('favoritos do cliente autenticado com MySQL local', () => {
  const client = createPrismaClient(url ?? 'mysql://invalid');
  const service = new CustomerFavoriteService(new CustomerFavoriteRepository(client));
  const suffix = randomUUID().slice(0, 8);
  let tenantId: bigint;
  let customerId: bigint;
  let otherCustomerId: bigint;
  let professionalPublicId = '';
  let servicePublicId = '';

  beforeEach(async () => {
    const tenant = await client.tenant.create({
      data: {
        publicId: randomUUID(),
        slug: `custfav-${suffix}-${randomUUID().slice(0, 4)}`,
        legalName: 'Teste',
        displayName: 'Teste',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
      },
    });
    tenantId = tenant.id;
    const [customer, otherCustomer, professional, catalog] = await Promise.all([
      client.customer.create({ data: { publicId: randomUUID(), tenantId, name: 'Cliente' } }),
      client.customer.create({
        data: { publicId: randomUUID(), tenantId, name: 'Outro Cliente' },
      }),
      client.professional.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Profissional',
          publicName: 'Profissional',
          calendarColor: '#111111',
        },
      }),
      client.service.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Consulta',
          durationMinutes: 45,
          priceCents: 12000n,
          color: '#111111',
        },
      }),
    ]);
    customerId = customer.id;
    otherCustomerId = otherCustomer.id;
    professionalPublicId = professional.publicId;
    servicePublicId = catalog.publicId;
  });

  afterEach(async () => {
    await client.auditLog.deleteMany({ where: { tenantId } });
    await client.customerFavorite.deleteMany({ where: { tenantId } });
    await client.customer.deleteMany({ where: { tenantId } });
    await client.service.deleteMany({ where: { tenantId } });
    await client.professional.deleteMany({ where: { tenantId } });
    await client.tenant.deleteMany({ where: { id: tenantId } });
  });

  it('favorita profissional e serviço, lista somente os favoritos do próprio cliente e registra auditoria', async () => {
    const favoriteProfessional = await service.create(tenantId, customerId, {
      professionalPublicId,
    });
    const favoriteService = await service.create(tenantId, customerId, { servicePublicId });
    await service.create(tenantId, otherCustomerId, { professionalPublicId });

    expect(favoriteProfessional).toMatchObject({
      professionalPublicId,
      servicePublicId: null,
    });
    expect(favoriteService).toMatchObject({ professionalPublicId: null, servicePublicId });

    const list = await service.list(tenantId, customerId);
    expect(list.items).toHaveLength(2);

    const auditCount = await client.auditLog.count({
      where: { tenantId, action: 'customer.favorite.created' },
    });
    expect(auditCount).toBe(3);
  });

  it('exige exatamente um alvo no contrato e impede favoritar o mesmo item duas vezes', async () => {
    expect(() =>
      CreateCustomerFavoriteRequestSchema.parse({ professionalPublicId, servicePublicId }),
    ).toThrow();
    expect(() => CreateCustomerFavoriteRequestSchema.parse({})).toThrow();

    await service.create(tenantId, customerId, { professionalPublicId });
    await expect(
      service.create(tenantId, customerId, { professionalPublicId }),
    ).rejects.toMatchObject({ code: 'CUSTOMER_FAVORITE_ALREADY_EXISTS' });
  });

  it('permite desfavoritar e impede remover favorito de outro cliente', async () => {
    const favorite = await service.create(tenantId, customerId, { professionalPublicId });

    await expect(
      service.remove(tenantId, otherCustomerId, favorite.publicId),
    ).rejects.toMatchObject({ code: 'CUSTOMER_FAVORITE_NOT_FOUND' });

    const result = await service.remove(tenantId, customerId, favorite.publicId);
    expect(result).toEqual({ success: true });

    const list = await service.list(tenantId, customerId);
    expect(list.items).toHaveLength(0);
  });
});
