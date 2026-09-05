import { readFileSync } from 'node:fs';

import { CreatePlanBenefitRequestSchema, UpdatePlanBenefitRequestSchema } from '@plataforma/shared';
import { describe, expect, it, vi } from 'vitest';

import { PlatformService } from './platform.service.js';

import type { PrismaClient } from '../../database-client/client.js';

const PLAN_A = '00000000-0000-4000-8000-00000000a001';
const ITEM_A = '00000000-0000-4000-8000-00000000b001';
const ITEM_B = '00000000-0000-4000-8000-00000000b002';

const actor = {
  user: { id: 1n, publicId: PLAN_A, email: 'admin@agendei.app' },
  permissions: ['platform.plan.update'],
} as unknown as Parameters<PlatformService['createPlanBenefit']>[2];
const metadata = { ip: '127.0.0.1', userAgent: 'test' } as unknown as Parameters<
  PlatformService['createPlanBenefit']
>[3];

const item = (overrides: Record<string, unknown> = {}) => ({
  id: 1n,
  publicId: ITEM_A,
  planId: 10n,
  text: 'Agenda online completa',
  sortOrder: 0,
  enabled: true,
  createdAt: new Date('2026-08-17T12:00:00.000Z'),
  updatedAt: new Date('2026-08-17T12:00:00.000Z'),
  ...overrides,
});

function client(overrides: Record<string, unknown> = {}) {
  const planBenefit = {
    findMany: vi.fn().mockResolvedValue([item()]),
    findUnique: vi.fn().mockResolvedValue(item()),
    create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(item(data)),
    ),
    update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(item(data)),
    ),
    delete: vi.fn().mockResolvedValue(item()),
  };
  const base = {
    commercialPlan: { findUnique: vi.fn().mockResolvedValue({ id: 10n }) },
    planBenefit,
    planLimit: { findMany: vi.fn(), update: vi.fn(), delete: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    ...overrides,
  };
  // A transação enxerga exatamente os mesmos mocks (inclusive sobrescritos).
  const transactional = { ...base };
  const database = {
    ...base,
    $transaction: vi.fn().mockImplementation((run: (tx: unknown) => Promise<unknown>) =>
      run(transactional),
    ),
  } as unknown as PrismaClient;
  return {
    database,
    items: base.planBenefit,
    limits: base.planLimit as Record<string, ReturnType<typeof vi.fn>>,
  };
}

describe('itens comerciais do card — contrato', () => {
  it('exige texto com pelo menos 2 caracteres e faz trim', () => {
    expect(CreatePlanBenefitRequestSchema.safeParse({ text: ' ' }).success).toBe(false);
    expect(CreatePlanBenefitRequestSchema.safeParse({ text: 'a' }).success).toBe(false);
    expect(CreatePlanBenefitRequestSchema.parse({ text: '  Agenda online  ' }).text).toBe(
      'Agenda online',
    );
    expect(
      CreatePlanBenefitRequestSchema.safeParse({ text: 'x'.repeat(161) }).success,
    ).toBe(false);
  });

  it('a edição aceita alterar apenas o texto ou apenas a ordem', () => {
    expect(UpdatePlanBenefitRequestSchema.parse({ text: 'Novo texto' })).toMatchObject({
      text: 'Novo texto',
    });
    expect(UpdatePlanBenefitRequestSchema.parse({ sortOrder: 3 })).toMatchObject({ sortOrder: 3 });
    expect(UpdatePlanBenefitRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('itens comerciais do card — operações', () => {
  it('adiciona um item ao plano informado', async () => {
    const { database, items } = client();
    const created = await new PlatformService(database).createPlanBenefit(
      PLAN_A,
      { text: 'CRM de clientes', sortOrder: 1, enabled: true },
      actor,
      metadata,
    );
    expect(created.benefit.text).toBe('CRM de clientes');
    expect(items.create).toHaveBeenCalledWith(
      expect.objectContaining<{ data: unknown }>({
        data: expect.objectContaining<{ planId: bigint }>({ planId: 10n }),
      }),
    );
  });

  it('edita apenas o texto do item endereçado', async () => {
    const { database, items } = client();
    const updated = await new PlatformService(database).updatePlanBenefit(
      ITEM_A,
      { text: 'Agenda inteligente com confirmação automática' },
      actor,
      metadata,
    );
    expect(updated.benefit.text).toBe('Agenda inteligente com confirmação automática');
    expect(items.findUnique).toHaveBeenCalledWith({ where: { publicId: ITEM_A } });
    expect(items.update).toHaveBeenCalledWith(
      expect.objectContaining<{ where: unknown }>({ where: { id: 1n } }),
    );
  });

  it('reordena persistindo sortOrder', async () => {
    const { database, items } = client();
    await new PlatformService(database).updatePlanBenefit(ITEM_A, { sortOrder: 2 }, actor, metadata);
    expect(items.update).toHaveBeenCalledWith(
      expect.objectContaining<{ data: unknown }>({
        data: expect.objectContaining<{ sortOrder: number }>({ sortOrder: 2 }),
      }),
    );
  });

  it('lista os itens do plano já ordenados', async () => {
    const { database, items } = client();
    await new PlatformService(database).listPlanBenefits(PLAN_A);
    expect(items.findMany).toHaveBeenCalledWith(
      expect.objectContaining<{ orderBy: unknown }>({ orderBy: { sortOrder: 'asc' } }),
    );
  });

  it('excluir um item não toca em nenhuma feature ou limite do plano', async () => {
    const { database, items, limits } = client();
    await new PlatformService(database).deletePlanBenefit(ITEM_A, actor, metadata);
    expect(items.delete).toHaveBeenCalled();
    expect(limits.update).not.toHaveBeenCalled();
    expect(limits.delete).not.toHaveBeenCalled();
    expect(limits.create).not.toHaveBeenCalled();
  });

  it('um item pertence a um único plano: a operação endereça só aquela linha', async () => {
    // O item do plano B é resolvido pelo próprio publicId e gravado pela PK
    // dele — não há caminho para alcançar o item de outro plano.
    const { database, items } = client({
      planBenefit: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(item({ id: 2n, publicId: ITEM_B, planId: 20n })),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue(item({ id: 2n, publicId: ITEM_B, planId: 20n })),
        delete: vi.fn(),
      },
    });
    await new PlatformService(database).updatePlanBenefit(ITEM_B, { text: 'Outro' }, actor, metadata);
    expect(items.findUnique).toHaveBeenCalledWith({ where: { publicId: ITEM_B } });
    expect(items.update).toHaveBeenCalledWith(
      expect.objectContaining<{ where: unknown }>({ where: { id: 2n } }),
    );
  });
});

describe('itens comerciais do card — superfícies', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

  it('só a plataforma altera os textos comerciais', () => {
    const routes = read('./platform.routes.ts');
    expect(routes).toContain("allow(request, 'platform.plan.update')");
    // Nenhuma rota de tenant edita item comercial de plano.
    expect(routes).toContain("'/platform/plans/:publicId/benefits'");
    expect(routes).toContain("'/platform/plan-benefits/:publicId'");
  });

  it('a home comercial recebe os itens comerciais dos planos publicados', () => {
    const service = read('./platform.service.ts');
    expect(service).toContain("benefits: { where: { enabled: true }, orderBy: { sortOrder: 'asc' } }");
  });

  it('o card público não monta a lista a partir de features', () => {
    const card = readFileSync(
      new URL('../../../../web/src/marketing/PricingCards.tsx', import.meta.url),
      'utf8',
    );
    expect(card).not.toContain('plan.limits');
    expect(card).toContain('left.sortOrder - right.sortOrder');
  });
});
