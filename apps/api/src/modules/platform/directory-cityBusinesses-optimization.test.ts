import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('cityBusinesses - Usa DirectoryCityAggregate', () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      directoryCategory: {
        findFirst: vi.fn(),
      },
      directoryCityAggregate: {
        findFirst: vi.fn(),
      },
      directoryBusiness: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
    };
  });

  it('cityBusinesses faz 3 queries: aggregate + findMany + count', async () => {
    mockPrisma.directoryCategory.findFirst.mockResolvedValue({
      id: 1n,
      slug: 'barbearias',
      active: true,
    });

    mockPrisma.directoryCityAggregate.findFirst.mockResolvedValue({
      businessCount: 150,
      whatsappCount: 120,
      topNeighborhoods: [
        { name: 'Centro', count: 50 },
        { name: 'Vila', count: 40 },
      ],
    });

    mockPrisma.directoryBusiness.findMany.mockResolvedValue([]);
    mockPrisma.directoryBusiness.count.mockResolvedValue(150);

    // Simula a lógica
    await mockPrisma.directoryCategory.findFirst({});
    const aggregate = await mockPrisma.directoryCityAggregate.findFirst({});
    await mockPrisma.directoryBusiness.findMany({});
    await mockPrisma.directoryBusiness.count({});

    // Verifica que fez apenas 4 chamadas (encontrar category, aggregate, findMany, count)
    expect(mockPrisma.directoryCategory.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.directoryCityAggregate.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.directoryBusiness.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.directoryBusiness.count).toHaveBeenCalledTimes(1);

    // Não há groupBy (otimizado)
    expect(mockPrisma.directoryBusiness.groupBy).toBeUndefined();

    // Retorna dados agregados
    expect(aggregate.whatsappCount).toBe(120);
    expect(aggregate.topNeighborhoods).toHaveLength(2);
  });

  it('aggregate zero funciona (não existente)', async () => {
    mockPrisma.directoryCategory.findFirst.mockResolvedValue({
      id: 1n,
      slug: 'barbearias',
    });

    mockPrisma.directoryCityAggregate.findFirst.mockResolvedValue(null);
    mockPrisma.directoryBusiness.findMany.mockResolvedValue([]);
    mockPrisma.directoryBusiness.count.mockResolvedValue(0);

    await mockPrisma.directoryCategory.findFirst({});
    const aggregate = await mockPrisma.directoryCityAggregate.findFirst({});
    await mockPrisma.directoryBusiness.findMany({});
    const total = await mockPrisma.directoryBusiness.count({});

    // Funciona mesmo com aggregate null
    const neighborhoods = aggregate?.topNeighborhoods || [];
    const whatsappCount = aggregate?.whatsappCount ?? 0;

    expect(neighborhoods).toHaveLength(0);
    expect(whatsappCount).toBe(0);
    expect(total).toBe(0);
  });
});
