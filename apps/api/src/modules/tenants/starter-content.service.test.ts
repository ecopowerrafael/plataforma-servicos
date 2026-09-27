import { BusinessProfileCatalog } from '@plataforma/shared';
import { describe, expect, it, vi } from 'vitest';

import { starterPresetFor, type STARTER_PRESETS } from './starter-content.presets.js';
import { seedStarterContent } from './starter-content.service.js';

import type { PrismaClient } from '../../database-client/client.js';

const SEEDED_IDS = {
  serviceIds: ['s-1', 's-2', 's-3'],
  comboId: 'c-1',
  professionalId: 'p-1',
};
const untouched = { createdAt: new Date('2026-01-01T10:00:00Z'), updatedAt: new Date('2026-01-01T10:00:00Z') };
const edited = { createdAt: new Date('2026-01-01T10:00:00Z'), updatedAt: new Date('2026-01-02T10:00:00Z') };

function client({
  seededAt = null as Date | null,
  services = 0,
  professionals = 0,
  serviceLimit = null as number | null,
  starterContentIds = null as unknown,
  onboardingCompletedAt = null as Date | null,
  starterRecords = untouched,
  appointments = 0,
}) {
  const created = {
    service: [],
    combo: [],
    comboItem: [],
    professional: [],
    professionalService: [],
    professionalUnit: [],
    professionalWorkSchedule: [],
  } as Record<string, unknown[]> & {
    service: unknown[];
    combo: unknown[];
    comboItem: unknown[];
    professional: unknown[];
    professionalService: unknown[];
    professionalUnit: unknown[];
    professionalWorkSchedule: unknown[];
  };
  let servicePrice = 1000n;
  const tx = {
    tenant: {
      findUnique: vi
        .fn()
        .mockResolvedValue({
          starterContentSeededAt: seededAt,
          starterContentIds,
          onboardingCompletedAt,
        }),
      update: vi.fn().mockResolvedValue({}),
    },
    appointment: { count: vi.fn().mockResolvedValue(appointments) },
    service: {
      count: vi.fn().mockImplementation(() => Promise.resolve(services + created.service.length)),
      findMany: vi
        .fn()
        .mockResolvedValue(
          SEEDED_IDS.serviceIds.map((_, index) => ({ id: BigInt(index + 1), ...starterRecords })),
        ),
      deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
      create: vi.fn().mockImplementation((args: { data: { priceCents: bigint } }): unknown => {
        created.service.push(args.data);
        servicePrice = args.data.priceCents;
        return Promise.resolve({ id: BigInt(created.service.length), priceCents: servicePrice });
      }),
    },
    professional: {
      count: vi.fn().mockResolvedValue(professionals),
      findFirst: vi.fn().mockResolvedValue({ id: 1n, ...starterRecords }),
      delete: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockImplementation((args: { data: unknown }) => {
        created.professional.push(args.data);
        return Promise.resolve({ id: 1n });
      }),
    },
    businessUnit: { findFirst: vi.fn().mockResolvedValue({ id: 7n }) },
    combo: {
      findFirst: vi.fn().mockResolvedValue({ id: 1n, ...starterRecords }),
      delete: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockImplementation((args: { data: unknown }) => {
        created.combo.push(args.data);
        return Promise.resolve({ id: 1n });
      }),
    },
    comboItem: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockImplementation((args: { data: unknown }) => {
        created.comboItem.push(args.data);
        return Promise.resolve({});
      }),
    },
    professionalService: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockImplementation((args: { data: unknown }) => {
        created.professionalService.push(args.data);
        return Promise.resolve({});
      }),
    },
    professionalUnit: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockImplementation((args: { data: unknown }) => {
        created.professionalUnit.push(args.data);
        return Promise.resolve({});
      }),
    },
    professionalWorkSchedule: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockImplementation((args: { data: unknown }) => {
        created.professionalWorkSchedule.push(args.data);
        return Promise.resolve({});
      }),
    },
    tenantPublicSite: { upsert: vi.fn().mockResolvedValue({}) },
    // Mesmo gate comercial usado na criação manual de serviços/profissionais.
    tenantSubscription: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          serviceLimit === null
            ? null
            : {
                currentPeriodStartsAt: new Date(),
                currentPeriodEndsAt: new Date(),
                plan: { limits: [{ integerValue: serviceLimit }] },
              },
        ),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  return {
    prisma: {
      $transaction: (run: (t: typeof tx) => Promise<unknown>) => run(tx),
    } as unknown as PrismaClient,
    tx,
    created,
  };
}

describe('conteúdo inicial do tenant', () => {
  it('cria 3 serviços com ícone, combo, profissional, vínculos e agenda seg-sáb', async () => {
    const { prisma, tx, created } = client({});
    await expect(seedStarterContent(prisma, 1n, 'BARBERSHOP')).resolves.toBe(true);
    expect(created.service).toHaveLength(3);
    expect(created.service.every((item) => (item as { iconKey: string }).iconKey.length > 0)).toBe(
      true,
    );
    expect((created.service[0] as { name: string }).name).toBe('Corte masculino');
    expect(created.combo).toHaveLength(1);
    expect(created.comboItem).toHaveLength(2);
    expect(created.professional).toHaveLength(1);
    expect(created.professionalService).toHaveLength(3);
    expect(created.professionalWorkSchedule).toHaveLength(6);
    expect(created.professionalWorkSchedule.map((item) => (item as { weekday: number }).weekday)).toEqual(
      [1, 2, 3, 4, 5, 6],
    );
    expect(
      created.professionalWorkSchedule.every(
        (item) =>
          (item as { startsAt: string }).startsAt === '09:00' &&
          (item as { endsAt: string }).endsAt === '18:00',
      ),
    ).toBe(true);
    const siteCall = tx.tenantPublicSite.upsert.mock.calls[0]?.[0] as
      | { create: { theme: string; layout: string } }
      | undefined;
    expect(siteCall?.create).toMatchObject({ theme: 'LUXURY', layout: 'PREMIUM_APP' });
  });

  it('varia o conteúdo conforme o tipo de negócio', async () => {
    const { prisma, created } = client({});
    await seedStarterContent(prisma, 1n, 'PET_CARE');
    expect(created.service.map((item) => (item as { name: string }).name)).toEqual([
      'Banho',
      'Tosa',
      'Corte de unhas',
    ]);
  });

  it('para de criar serviços ao atingir o limite do plano', async () => {
    const { prisma, created } = client({ serviceLimit: 2 });
    await seedStarterContent(prisma, 1n, 'BARBERSHOP');
    expect(created.service.length).toBeLessThanOrEqual(2);
  });

  it('é idempotente: não recria nada quando a marca técnica já existe', async () => {
    const { prisma, tx, created } = client({ seededAt: new Date() });
    await expect(seedStarterContent(prisma, 1n, 'BARBERSHOP')).resolves.toBe(false);
    expect(created.service).toHaveLength(0);
    expect(tx.professional.create).not.toHaveBeenCalled();
  });

  it('não semeia por cima de catálogo real e apenas marca o tenant', async () => {
    const { prisma, tx, created } = client({ services: 4 });
    await expect(seedStarterContent(prisma, 1n, 'BARBERSHOP')).resolves.toBe(false);
    expect(created.service).toHaveLength(0);
    const markCall = tx.tenant.update.mock.calls[0]?.[0] as
      | { data: { starterContentSeededAt: Date } }
      | undefined;
    expect(markCall?.data.starterContentSeededAt).toBeInstanceOf(Date);
  });

  it('troca o tipo de negócio no onboarding substituindo só o conteúdo do sistema', async () => {
    const { prisma, tx, created } = client({
      seededAt: new Date(),
      starterContentIds: SEEDED_IDS,
    });
    await expect(seedStarterContent(prisma, 1n, 'BEAUTY_SALON')).resolves.toBe(true);
    expect(tx.service.deleteMany).toHaveBeenCalledOnce();
    expect(tx.professional.delete).toHaveBeenCalledOnce();
    expect(tx.combo.delete).toHaveBeenCalledOnce();
    // Sem duplicar: o novo preset entra no lugar do anterior.
    expect(created.service.map((item) => (item as { name: string }).name)).toEqual([
      'Corte',
      'Escova',
      'Hidratação',
    ]);
    expect(created.professional).toHaveLength(1);
  });

  it('não apaga nada quando o conteúdo inicial já foi editado', async () => {
    const { prisma, tx, created } = client({
      seededAt: new Date(),
      starterContentIds: SEEDED_IDS,
      starterRecords: edited,
    });
    await expect(seedStarterContent(prisma, 1n, 'BEAUTY_SALON')).resolves.toBe(false);
    expect(tx.service.deleteMany).not.toHaveBeenCalled();
    expect(tx.professional.delete).not.toHaveBeenCalled();
    expect(created.service).toHaveLength(0);
  });

  it('não apaga nada quando o conteúdo inicial já foi agendado', async () => {
    const { prisma, tx } = client({
      seededAt: new Date(),
      starterContentIds: SEEDED_IDS,
      appointments: 1,
    });
    await expect(seedStarterContent(prisma, 1n, 'BEAUTY_SALON')).resolves.toBe(false);
    expect(tx.service.deleteMany).not.toHaveBeenCalled();
  });

  it('não apaga nada depois do onboarding concluído', async () => {
    const { prisma, tx } = client({
      seededAt: new Date(),
      starterContentIds: SEEDED_IDS,
      onboardingCompletedAt: new Date(),
    });
    await expect(seedStarterContent(prisma, 1n, 'BEAUTY_SALON')).resolves.toBe(false);
    expect(tx.service.deleteMany).not.toHaveBeenCalled();
  });

  it('registra os publicIds gerados para permitir a substituição', async () => {
    const { prisma, tx } = client({});
    await seedStarterContent(prisma, 1n, 'BARBERSHOP');
    const call = tx.tenant.update.mock.calls.at(-1)?.[0] as
      | { data: { starterContentIds: { serviceIds: string[]; professionalId: string | null } } }
      | undefined;
    expect(call?.data.starterContentIds.serviceIds).toHaveLength(3);
    expect(call?.data.starterContentIds.professionalId).not.toBeNull();
  });

  it('cobre todos os tipos de negócio do catálogo, com combo de 2 serviços distintos', () => {
    for (const code of Object.keys(BusinessProfileCatalog)) {
      const preset = starterPresetFor(code as keyof typeof STARTER_PRESETS);
      expect(preset.services).toHaveLength(3);
      expect(new Set(preset.combo.serviceIndexes).size).toBe(2);
      expect(preset.banner.endsWith('.webp')).toBe(true);
    }
  });
});
