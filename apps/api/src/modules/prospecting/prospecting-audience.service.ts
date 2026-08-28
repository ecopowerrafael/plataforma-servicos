import { type PrismaClient } from '../../database-client/client.js';

export interface AudienceFilterRequest {
  categories?: bigint[];
  cities?: string[];
  states?: string[];
  search?: string;
  contactStatus?: 'all' | 'never' | 'contacted';
  phoneStatus?: 'valid' | 'all';
  suppressionCampaignId?: bigint;
}

export interface AudienceCounters {
  total: number;
  withPhone: number;
  neverContacted: number;
  contacted: number;
  suppressed: number;
  eligible: number;
}

export class ProspectingAudienceService {
  public constructor(private readonly client: PrismaClient) {}

  public async getCategories() {
    const categories = await this.client.directoryCategory.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return categories.map((c: { id: bigint; name: string }) => ({
      id: c.id.toString(),
      name: c.name,
    }));
  }

  public async getCities(filters?: { states?: string[] }) {
    const cities = await this.client.directoryBusiness.findMany({
      where: {
        active: true,
        whatsapp: { not: null },
        tenantId: null,
        ...(filters?.states?.length && { state: { in: filters.states } }),
      },
      select: {
        city: true,
        state: true,
      },
      distinct: ['city', 'state'],
      orderBy: [{ state: 'asc' }, { city: 'asc' }],
    });

    return cities.map((c) => ({
      city: c.city,
      state: c.state,
      label: `${c.city}, ${c.state}`,
    }));
  }

  public async getAudienceCounters(
    campaignId: bigint,
    filters: AudienceFilterRequest
  ): Promise<AudienceCounters> {
    // Query for all businesses matching filters
    const whereClause = this.buildWhereClause(filters);

    const total = await this.client.directoryBusiness.count({
      where: whereClause,
    });

    const withPhone = await this.client.directoryBusiness.count({
      where: {
        ...whereClause,
        whatsapp: { not: null },
      },
    });

    // Count never contacted (no ProspectingLead with any campaign)
    const neverContacted = await this.client.directoryBusiness.count({
      where: {
        ...whereClause,
        whatsapp: { not: null },
        prospectingLeads: {
          none: {},
        },
      },
    });

    // Count contacted (has ProspectingLead in ANY campaign)
    const contacted = withPhone - neverContacted;

    // Count suppressed for this campaign
    const suppressed = await this.client.prospectingSuppression.count({
      where: {
        campaignId,
      },
    });

    // Eligible = withPhone - suppressed
    const eligible = Math.max(0, withPhone - suppressed);

    return {
      total,
      withPhone,
      neverContacted,
      contacted,
      suppressed,
      eligible,
    };
  }

  public async getAudiencePage(
    campaignId: bigint,
    filters: AudienceFilterRequest,
    page: number = 1,
    limit: number = 50
  ) {
    const offset = (page - 1) * limit;
    const whereClause = this.buildWhereClause(filters);

    // Get suppressed phones for this campaign
    const suppressedPhones = await this.client.prospectingSuppression.findMany({
      where: { campaignId },
      select: { normalizedPhone: true },
    });
    const suppressedSet = new Set(suppressedPhones.map((s) => s.normalizedPhone));

    // Get businesses
    const businesses = await this.client.directoryBusiness.findMany({
      where: whereClause,
      include: {
        prospectingLeads: {
          select: {
            id: true,
            lastOutboundAt: true,
            respondedAt: true,
          },
          orderBy: {
            lastOutboundAt: 'desc' as const,
          },
          take: 1,
        },
        category: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
      take: limit,
      skip: offset,
    });

    const total = await this.client.directoryBusiness.count({
      where: whereClause,
    });

    return {
      data: businesses.map((b) => {
        const lastLead = b.prospectingLeads[0];
        const normalizedPhone = b.whatsapp?.replace(/\D/g, '') || '';
        const isSupressed = suppressedSet.has(normalizedPhone);

        let status = 'Nunca enviado';
        if (isSupressed) {
          status = 'Suprimido';
        } else if (lastLead?.respondedAt) {
          status = 'Respondeu';
        } else if (lastLead?.lastOutboundAt) {
          status = 'Já enviado';
        }

        return {
          id: b.publicId,
          name: b.name,
          category: b.category?.name || '',
          city: b.city,
          state: b.state,
          phone: b.whatsapp ? this.formatPhone(b.whatsapp) : '',
          status,
          lastSent: lastLead?.lastOutboundAt || null,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  private buildWhereClause(filters: AudienceFilterRequest) {
    const where: any = {
      active: true,
      tenantId: null,
    };

    if (filters.phoneStatus === 'valid') {
      where.whatsapp = { not: null };
    }

    if (filters.categories?.length) {
      where.categoryId = { in: filters.categories };
    }

    if (filters.cities?.length) {
      where.OR = filters.cities
        .map((cityState) => {
          const [city, state] = cityState.split(',').map((s) => s.trim());
          return city && state ? { city, state } : null;
        })
        .filter(Boolean);
    }

    if (filters.search) {
      where.name = { contains: filters.search };
    }

    if (filters.contactStatus === 'never') {
      where.prospectingLeads = { none: {} };
    } else if (filters.contactStatus === 'contacted') {
      where.prospectingLeads = { some: {} };
    }

    return where;
  }

  private formatPhone(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length >= 10) {
      const ddd = cleaned.slice(0, 2);
      const part1 = cleaned.slice(2, 7);
      const part2 = cleaned.slice(7);
      return `(${ddd}) ${part1}-${part2}`;
    }
    return phone;
  }
}
