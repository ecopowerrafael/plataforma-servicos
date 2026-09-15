import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { ProspectingService } from '../src/modules/prospecting/prospecting.service.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;

describe.skipIf(url === undefined)('Prospecting Foundation (Phase 1)', () => {
  const client = createPrismaClient(url ?? 'mysql://invalid');
  const suffix = randomUUID().slice(0, 8);
  let tenantId: bigint;
  let categoryId: bigint;
  let businessId1: bigint;
  let businessId2: bigint;

  beforeEach(async () => {
    const tenant = await client.tenant.create({
      data: {
        publicId: randomUUID(),
        slug: `prospect-${suffix}-${randomUUID().slice(0, 4)}`,
        legalName: 'Prospecting Test Tenant',
        displayName: 'Prospect Test',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
      },
    });
    tenantId = tenant.id;

    const category = await client.directoryCategory.create({
      data: {
        publicId: randomUUID(),
        name: 'Test Category',
        singularName: 'Test',
        pluralName: 'Tests',
        slug: `test-${suffix}`,
        active: true,
      },
    });
    categoryId = category.id;

    businessId1 = (
      await client.directoryBusiness.create({
        data: {
          publicId: randomUUID(),
          name: 'Business 1',
          categoryId,
          active: true,
          whatsapp: '5511987654321',
          state: 'SP',
          city: 'São Paulo',
        },
      })
    ).id;

    businessId2 = (
      await client.directoryBusiness.create({
        data: {
          publicId: randomUUID(),
          name: 'Business 2',
          categoryId,
          active: true,
          whatsapp: '5511998765432',
          state: 'SP',
          city: 'São Paulo',
        },
      })
    ).id;
  });

  afterEach(async () => {
    await client.prospectingMessage.deleteMany({ where: {} });
    await client.prospectingLead.deleteMany({ where: {} });
    await client.prospectingSuppression.deleteMany({ where: {} });
    await client.prospectingCampaign.deleteMany({ where: {} });
    await client.directoryBusiness.deleteMany({ where: { categoryId } });
    await client.directoryCategory.deleteMany({ where: { id: categoryId } });
    await client.tenant.deleteMany({ where: { id: tenantId } });
  });

  it('✅ Criação de campanha com valores padrão', async () => {
    const service = new ProspectingService(client);

    const campaign = await service.createCampaign({
      name: 'Campaign Test 1',
    });

    expect(campaign.name).toBe('Campaign Test 1');
    expect(campaign.status).toBe('DRAFT');
    expect(campaign.dailyLimit).toBe(100);
    expect(campaign.sendingStartMinutes).toBe(540); // 9 AM
    expect(campaign.sendingEndMinutes).toBe(1080); // 6 PM
    expect(campaign.minIntervalSeconds).toBe(30);
    expect(campaign.maxIntervalSeconds).toBe(120);
    expect(campaign.allowedWeekdays).toEqual([1, 2, 3, 4, 5]); // Mon-Fri
  });

  it('✅ Materialização de leads filtra negócios ativos com WhatsApp', async () => {
    const service = new ProspectingService(client);

    // Criar negócio inativo
    await client.directoryBusiness.create({
      data: {
        publicId: randomUUID(),
        name: 'Inactive Business',
        categoryId,
        active: false,
        whatsapp: '5511999999999',
        state: 'SP',
        city: 'São Paulo',
      },
    });

    // Criar negócio ativo sem WhatsApp
    await client.directoryBusiness.create({
      data: {
        publicId: randomUUID(),
        name: 'No WhatsApp Business',
        categoryId,
        active: true,
        state: 'SP',
        city: 'São Paulo',
      },
    });

    const campaign = await service.createCampaign({ name: 'Filter Test' });
    const count = await service.materializeLeads(campaign.id);

    // Esperado: apenas os 2 negócios ativos com WhatsApp
    expect(count).toBe(2);

    const leads = await service.getLeads(campaign.id);
    expect(leads).toHaveLength(2);
    expect(leads.map((l) => l.phoneSnapshot).sort()).toEqual(['5511987654321', '5511998765432']);
  });

  it('✅ Evita duplicatas de leads na mesma campanha', async () => {
    const service = new ProspectingService(client);

    const campaign = await service.createCampaign({ name: 'Duplicate Test' });

    // Primeira materialização
    const count1 = await service.materializeLeads(campaign.id);
    expect(count1).toBe(2);

    // Segunda materialização (deve retornar 0, pois leads já existem)
    const count2 = await service.materializeLeads(campaign.id);
    expect(count2).toBe(0);

    const leads = await service.getLeads(campaign.id);
    expect(leads).toHaveLength(2);
  });

  it('✅ Respeita filtros de categoria, estado e cidade', async () => {
    const service = new ProspectingService(client);

    // Criar negócio em outro estado
    await client.directoryBusiness.create({
      data: {
        publicId: randomUUID(),
        name: 'Business RJ',
        categoryId,
        active: true,
        whatsapp: '5521987654321',
        state: 'RJ',
        city: 'Rio de Janeiro',
      },
    });

    const campaign = await service.createCampaign({ name: 'Filter by State' });

    // Materializar apenas SP
    const countSP = await service.materializeLeads(campaign.id, undefined, 'SP');
    expect(countSP).toBe(2);

    // Tentar materializar RJ em nova campanha (duplicatas na mesma são bloqueadas)
    const campaign2 = await service.createCampaign({ name: 'Filter RJ' });
    const countRJ = await service.materializeLeads(campaign2.id, undefined, 'RJ');
    expect(countRJ).toBe(1);
  });

  it('✅ Bloqueia números suprimidos', async () => {
    const service = new ProspectingService(client);

    const campaign = await service.createCampaign({ name: 'Suppression Test' });

    // Suprimir um número
    await service.addSuppression(campaign.id, '5511987654321', 'Test suppress');

    // Materializar leads (deve ignorar o número suprimido)
    const count = await service.materializeLeads(campaign.id);
    expect(count).toBe(1); // Apenas business2

    const leads = await service.getLeads(campaign.id);
    expect(leads).toHaveLength(1);
    expect(leads[0]?.phoneSnapshot).toBe('5511998765432');
  });

  it('✅ Ciclo de vida da campanha (DRAFT → RUNNING → PAUSED → COMPLETED)', async () => {
    const service = new ProspectingService(client);

    const campaign = await service.createCampaign({ name: 'Lifecycle Test' });
    expect(campaign.status).toBe('DRAFT');
    expect(campaign.startedAt).toBeNull();

    const running = await service.startCampaign(campaign.publicId);
    expect(running.status).toBe('RUNNING');
    expect(running.startedAt).not.toBeNull();

    const paused = await service.pauseCampaign(campaign.publicId);
    expect(paused.status).toBe('PAUSED');
    expect(paused.pausedAt).not.toBeNull();

    const resumed = await service.resumeCampaign(campaign.publicId);
    expect(resumed.status).toBe('RUNNING');
    expect(resumed.pausedAt).toBeNull();

    const completed = await service.completeCampaign(campaign.publicId);
    expect(completed.status).toBe('COMPLETED');
    expect(completed.completedAt).not.toBeNull();
  });

  it('✅ CRUD de campanhas (create/read/update/list)', async () => {
    const service = new ProspectingService(client);

    // Create
    const campaign1 = await service.createCampaign({
      name: 'CRUD Test 1',
      dailyLimit: 50,
    });
    const campaign2 = await service.createCampaign({
      name: 'CRUD Test 2',
      dailyLimit: 200,
    });

    // List
    const campaigns = await service.listCampaigns();
    expect(campaigns.length).toBeGreaterThanOrEqual(2);

    // Read single
    const fetched = await service.getCampaign(campaign1.publicId);
    expect(fetched?.name).toBe('CRUD Test 1');
    expect(fetched?.dailyLimit).toBe(50);

    // Update
    const updated = await service.updateCampaign(campaign1.publicId, {
      name: 'CRUD Test 1 Updated',
      dailyLimit: 75,
    });
    expect(updated.name).toBe('CRUD Test 1 Updated');
    expect(updated.dailyLimit).toBe(75);

    // Verify update persisted
    const refetched = await service.getCampaign(campaign1.publicId);
    expect(refetched?.name).toBe('CRUD Test 1 Updated');
  });

  it('✅ Normalização de telefone remove não-dígitos', async () => {
    const service = new ProspectingService(client);

    // Criar negócio com formato de telefone diferentes
    const businessFormatted = await client.directoryBusiness.create({
      data: {
        publicId: randomUUID(),
        name: 'Formatted Phone',
        categoryId,
        active: true,
        whatsapp: '+55 (11) 98765-4321',
        state: 'SP',
        city: 'São Paulo',
      },
    });

    const campaign = await service.createCampaign({ name: 'Phone Normalization' });
    await service.materializeLeads(campaign.id);

    // Suprimir com telefone normalizado
    await service.addSuppression(campaign.id, '+55 (11) 98765-4321', 'Formatted suppress');

    // Criar campanha 2 e materializar (o número formatado deve ser bloqueado)
    const campaign2 = await service.createCampaign({ name: 'Normalization Check' });
    const count = await service.materializeLeads(campaign2.id);

    // Verificar se foi bloqueado
    const leads = await service.getLeads(campaign2.id);
    const hasFormattedBusiness = leads.some((l) => l.directoryBusinessId === businessFormatted.id);
    expect(hasFormattedBusiness).toBe(false);
  });
});
