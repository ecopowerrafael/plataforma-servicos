import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { LocalServiceImageStorage } from '../src/modules/services/service-image.storage.js';
import { PrismaServiceRepository } from '../src/modules/services/service.repository.js';
import { type ServiceRepository } from '../src/modules/services/service.repository.js';
import { ServiceService } from '../src/modules/services/service.service.js';

const databaseUrl = process.env.MYSQL_INTEGRATION_DATABASE_URL;

function png(width: number, height: number): Buffer {
  const image = Buffer.alloc(24);
  Buffer.from('\x89PNG\r\n\x1a\n', 'binary').copy(image);
  image.writeUInt32BE(13, 8);
  image.write('IHDR', 12, 'ascii');
  image.writeUInt32BE(width, 16);
  image.writeUInt32BE(height, 20);
  return image;
}

describe.skipIf(databaseUrl === undefined)('servi\u00e7os com MySQL 8', () => {
  const url = databaseUrl ?? 'mysql://USER:PASSWORD@127.0.0.1:3306/plataforma_servicos';
  const client = createPrismaClient(url);
  const suffix = randomUUID().slice(0, 8);
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const storageRoot = join(tmpdir(), `plataforma-service-images-${suffix}`);
  const service = new ServiceService(
    new PrismaServiceRepository(client),
    new LocalServiceImageStorage(storageRoot),
  );
  let tenantA: bigint;
  let tenantB: bigint;

  const input = {
    name: 'Consulta inicial',
    description: 'Avalia\u00e7\u00e3o de entrada',
    imageAlt: 'Mesa de atendimento',
    durationMinutes: 45,
    hasPostServiceBreak: true,
    postServiceBreakMinutes: 15,
    priceCents: 15000,
    color: '#2563EB',
    sortOrder: 1,
    active: true,
  };

  beforeAll(async () => {
    const first = await client.tenant.create({
      data: {
        publicId: tenantAId,
        slug: `service-a-${suffix}`,
        legalName: 'Servi\u00e7os A Ltda',
        displayName: 'Servi\u00e7os A',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
      },
    });
    const second = await client.tenant.create({
      data: {
        publicId: tenantBId,
        slug: `service-b-${suffix}`,
        legalName: 'Servi\u00e7os B Ltda',
        displayName: 'Servi\u00e7os B',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
      },
    });
    tenantA = first.id;
    tenantB = second.id;
  });

  afterAll(async () => {
    await client.service.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    await client.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    await client.$disconnect();
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('cria, edita, pagina, ativa e isola servi\u00e7os', async () => {
    const created = await service.create(tenantA, input);
    expect(created.priceCents).toBe('15000');
    expect(created.postServiceBreakMinutes).toBe(15);
    await expect(service.create(tenantA, input)).rejects.toMatchObject({
      code: 'SERVICE_NAME_CONFLICT',
    });
    await service.create(tenantB, input);
    expect((await service.list(tenantA, { page: 1, limit: 1 })).items).toHaveLength(1);
    await expect(service.get(tenantB, created.publicId)).rejects.toMatchObject({
      code: 'SERVICE_NOT_FOUND',
    });
    const updated = await service.update(tenantA, created.publicId, {
      ...input,
      name: 'Consulta revisada',
      priceCents: 18000,
      hasPostServiceBreak: false,
      postServiceBreakMinutes: 0,
    });
    expect(updated.name).toBe('Consulta revisada');
    expect(updated.priceCents).toBe('18000');
    await service.setActive(tenantA, created.publicId, false);
    expect((await service.get(tenantA, created.publicId)).active).toBe(false);
  });

  it('substitui e remove a imagem sem vazar entre tenants', async () => {
    const created = await service.create(tenantA, { ...input, name: 'Servi\u00e7o com imagem' });
    const uploaded = await service.replaceImage(tenantA, created.publicId, png(32, 32));
    expect(uploaded.imageUrl).toContain(created.publicId);
    expect((await service.getImage(tenantA, created.publicId)).mimeType).toBe('image/png');
    await expect(service.getImage(tenantB, created.publicId)).rejects.toMatchObject({
      code: 'SERVICE_NOT_FOUND',
    });
    const removed = await service.removeImage(tenantA, created.publicId);
    expect(removed.imageUrl).toBeNull();
  });

  it('limpa o novo arquivo quando a atualiza\u00e7\u00e3o do v\u00ednculo falha', async () => {
    const created = await service.create(tenantA, { ...input, name: 'Imagem com rollback' });
    const baseRepository = new PrismaServiceRepository(client);
    const storage = new LocalServiceImageStorage(storageRoot);
    const remove = vi.fn(storage.remove.bind(storage));
    const failingRepository: ServiceRepository = {
      list: (...args) => baseRepository.list(...args),
      find: (...args) => baseRepository.find(...args),
      findWithTenant: (...args) => baseRepository.findWithTenant(...args),
      create: (...args) => baseRepository.create(...args),
      update: async (id, data) => {
        if (data.imagePath !== undefined) throw new Error('controlled persistence failure');
        return baseRepository.update(id, data);
      },
      recordAudit: (...args) => baseRepository.recordAudit(...args),
    };
    const failingService = new ServiceService(failingRepository, {
      save: (...args) => storage.save(...args),
      read: (...args) => storage.read(...args),
      remove,
    });

    await expect(
      failingService.replaceImage(tenantA, created.publicId, png(32, 32)),
    ).rejects.toThrow('controlled persistence failure');
    expect(remove).toHaveBeenCalledTimes(1);
    expect((await service.get(tenantA, created.publicId)).imageUrl).toBeNull();
  });
});
