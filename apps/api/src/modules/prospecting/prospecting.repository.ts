import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '../../database-client/client.js';

export class ProspectingRepository {
  public constructor(private readonly client: PrismaClient) {}

  // Campaign CRUD
  public createCampaign(data: {
    name: string;
    categoryId?: bigint;
    state?: string;
    city?: string;
    dailyLimit?: number;
    sendingStartMinutes?: number;
    sendingEndMinutes?: number;
    minIntervalSeconds?: number;
    maxIntervalSeconds?: number;
    allowedWeekdays?: number[];
  }) {
    const createData: Prisma.ProspectingCampaignUncheckedCreateInput = {
      publicId: randomUUID(),
      name: data.name,
      dailyLimit: data.dailyLimit ?? 100,
      sendingStartMinutes: data.sendingStartMinutes ?? 540,
      sendingEndMinutes: data.sendingEndMinutes ?? 1080,
      minIntervalSeconds: data.minIntervalSeconds ?? 30,
      maxIntervalSeconds: data.maxIntervalSeconds ?? 120,
      allowedWeekdays: data.allowedWeekdays ?? [1, 2, 3, 4, 5],
    };

    if (data.categoryId !== undefined) createData.categoryId = data.categoryId;
    if (data.state !== undefined) createData.state = data.state;
    if (data.city !== undefined) createData.city = data.city;

    return this.client.prospectingCampaign.create({ data: createData });
  }

  public getCampaign(publicId: string) {
    return this.client.prospectingCampaign.findUnique({
      where: { publicId },
    });
  }

  public listCampaigns() {
    return this.client.prospectingCampaign.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  public updateCampaign(
    publicId: string,
    data: Prisma.ProspectingCampaignUpdateInput,
  ) {
    return this.client.prospectingCampaign.update({
      where: { publicId },
      data,
    });
  }

  // Lead materialization
  public async materializeLeads(
    campaignId: bigint,
    categoryId?: bigint,
    state?: string,
    city?: string,
  ): Promise<number> {
    // Query DirectoryBusiness com filtros
    const businesses = await this.client.directoryBusiness.findMany({
      where: {
        active: true,
        whatsapp: { not: null },
        tenantId: null,
        ...(categoryId && { categoryId }),
        ...(state && { state }),
        ...(city && { city }),
      },
      select: {
        id: true,
        publicId: true,
        name: true,
        whatsapp: true,
      },
    });

    if (businesses.length === 0) return 0;

    // Normalizar telefones e checar suppressions
    const suppressedPhones = await this.client.prospectingSuppression.findMany({
      where: { campaignId },
      select: { normalizedPhone: true },
    });
    const suppressedSet = new Set(suppressedPhones.map((s) => s.normalizedPhone));

    // Checar leads já existentes na campanha
    const existingLeads = await this.client.prospectingLead.findMany({
      where: { campaignId },
      select: { directoryBusinessId: true },
    });
    const existingIds = new Set(existingLeads.map((l) => l.directoryBusinessId));

    // Criar leads novo s
    const leadsToCreate: Prisma.ProspectingLeadCreateManyInput[] = [];
    for (const business of businesses) {
      if (existingIds.has(business.id)) continue;

      const normalized = this.normalizePhone(business.whatsapp ?? '');
      if (suppressedSet.has(normalized)) continue;

      leadsToCreate.push({
        publicId: randomUUID(),
        campaignId,
        directoryBusinessId: business.id,
        phoneSnapshot: business.whatsapp ?? '',
        normalizedPhone: normalized,
        nameSnapshot: business.name,
      });
    }

    if (leadsToCreate.length === 0) return 0;

    const result = await this.client.prospectingLead.createMany({
      data: leadsToCreate,
      skipDuplicates: true,
    });

    return result.count;
  }

  // Leads
  public getLeads(campaignId: bigint, limit = 100) {
    return this.client.prospectingLead.findMany({
      where: { campaignId },
      take: limit,
      orderBy: { createdAt: 'asc' },
    });
  }

  public getLead(publicId: string) {
    return this.client.prospectingLead.findUnique({
      where: { publicId },
      include: { directoryBusiness: true },
    });
  }

  public updateLead(publicId: string, data: Prisma.ProspectingLeadUpdateInput) {
    return this.client.prospectingLead.update({
      where: { publicId },
      data,
    });
  }

  // Suppressions
  public addSuppression(
    campaignId: bigint,
    normalizedPhone: string,
    reason: string,
  ) {
    return this.client.prospectingSuppression.create({
      data: {
        campaignId,
        normalizedPhone,
        reason,
      },
    });
  }

  // Utilities
  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }
}
