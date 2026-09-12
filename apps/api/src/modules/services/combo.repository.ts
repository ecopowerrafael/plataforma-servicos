import { randomUUID } from 'node:crypto';

import { type Prisma, type PrismaClient, type Combo } from '../../database-client/client.js';

export interface ComboItemRecord {
  serviceId: bigint;
  sortOrder: number;
  service: {
    publicId: string;
    name: string;
    durationMinutes: number;
    hasPostServiceBreak: boolean;
    postServiceBreakMinutes: number;
    active: boolean;
  };
}
export type ComboRecord = Combo & { items: ComboItemRecord[] };

const include = {
  items: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      service: {
        select: {
          publicId: true,
          name: true,
          durationMinutes: true,
          hasPostServiceBreak: true,
          postServiceBreakMinutes: true,
          active: true,
        },
      },
    },
  },
};

interface ItemInput {
  serviceId: bigint;
  sortOrder: number;
}

export class PrismaComboRepository {
  public constructor(private readonly client: PrismaClient) {}

  public async list(where: Prisma.ComboWhereInput, page: number, limit: number) {
    const [total, combos] = await this.client.$transaction([
      this.client.combo.count({ where }),
      this.client.combo.findMany({
        where,
        include,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { total, combos: combos as ComboRecord[] };
  }

  public find(tenantId: bigint, publicId: string) {
    return this.client.combo.findFirst({
      where: { tenantId, publicId },
      include,
    }) as Promise<ComboRecord | null>;
  }

  public findWithTenant(tenantId: bigint, publicId: string) {
    return this.client.combo.findFirst({
      where: { tenantId, publicId },
      include: { ...include, tenant: { select: { publicId: true } } },
    }) as Promise<(ComboRecord & { tenant: { publicId: string } }) | null>;
  }

  public findServices(tenantId: bigint, publicIds: string[]) {
    return this.client.service.findMany({ where: { tenantId, publicId: { in: publicIds } } });
  }

  public async create(
    tenantId: bigint,
    publicId: string,
    data: Omit<Prisma.ComboUncheckedCreateInput, 'tenantId' | 'publicId' | 'items'>,
    items: ItemInput[],
  ) {
    const combo = await this.client.combo.create({
      data: {
        publicId,
        tenantId,
        ...data,
        items: {
          create: items.map((item) => ({
            publicId: randomUUID(),
            tenantId,
            serviceId: item.serviceId,
            sortOrder: item.sortOrder,
          })),
        },
      },
      include,
    });
    return combo as ComboRecord;
  }

  public async update(
    tenantId: bigint,
    id: bigint,
    data: Omit<Prisma.ComboUncheckedUpdateInput, 'tenantId' | 'publicId' | 'items'>,
    items: ItemInput[],
  ) {
    const [, combo] = await this.client.$transaction([
      this.client.comboItem.deleteMany({ where: { comboId: id } }),
      this.client.combo.update({
        where: { id },
        data: {
          ...data,
          items: {
            create: items.map((item) => ({
              publicId: randomUUID(),
              tenantId,
              serviceId: item.serviceId,
              sortOrder: item.sortOrder,
            })),
          },
        },
        include,
      }),
    ]);
    return combo as ComboRecord;
  }

  public async setActive(id: bigint, active: boolean) {
    await this.client.combo.update({ where: { id }, data: { active } });
  }

  public async updateImage(id: bigint, imagePath: string | null) {
    const combo = await this.client.combo.update({ where: { id }, data: { imagePath }, include });
    return combo as ComboRecord;
  }

  public professionalsLinkedToServices(tenantId: bigint, serviceIds: bigint[]) {
    return this.client.professionalService.findMany({
      where: {
        tenantId,
        serviceId: { in: serviceIds },
        active: true,
        professional: { active: true },
      },
      select: {
        professionalId: true,
        serviceId: true,
        professional: { select: { publicId: true, publicName: true } },
        service: { select: { publicId: true } },
      },
    });
  }

  public audit(data: Prisma.AuditLogUncheckedCreateInput) {
    return this.client.auditLog.create({ data });
  }
}
