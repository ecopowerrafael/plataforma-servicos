import { type PrismaClient } from '../../database-client/client.js';
import { normalizeWhatsAppPhone } from '../integrations/whatsapp-phone.js';

export interface PreviewFilterRequest {
  categoryPublicIds?: string[];
  cities?: string[];
  search?: string;
  contactStatus?: 'all' | 'never' | 'contacted';
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
      where: { active: true },
      select: {
        publicId: true,
        name: true,
      },
      orderBy: {
        sortOrder: 'asc',
      },
    });

    return categories.map((c) => ({
      publicId: c.publicId,
      name: c.name,
    }));
  }

  public async getCities(filters?: { categoryPublicIds?: string[] }) {
    const whereClause: any = {
      active: true,
    };

    if (filters?.categoryPublicIds?.length) {
      const categoryIds = await this.client.directoryCategory
        .findMany({
          where: { publicId: { in: filters.categoryPublicIds } },
          select: { id: true },
        })
        .then((cats) => cats.map((c) => c.id));
      whereClause.categoryId = { in: categoryIds };
    }

    const cities = await this.client.directoryBusiness.findMany({
      where: whereClause,
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

  public async getPreviewCounters(filters: PreviewFilterRequest): Promise<AudienceCounters> {
    const whereClause = await this.buildWhereClause(filters);

    // Get total
    const total = await this.client.directoryBusiness.count({ where: whereClause });

    // Get with valid phone
    const withPhone = await this.client.directoryBusiness.count({
      where: { ...whereClause, whatsapp: { not: null } },
    });

    // Get never contacted
    const neverContacted = await this.client.directoryBusiness.count({
      where: {
        ...whereClause,
        whatsapp: { not: null },
        prospectingLeads: { none: {} },
      },
    });

    // Get contacted
    const contacted = withPhone - neverContacted;

    // Suppressed doesn't apply to preview (no campaign yet)
    const suppressed = 0;
    const eligible = withPhone;

    return {
      total,
      withPhone,
      neverContacted,
      contacted,
      suppressed,
      eligible,
    };
  }

  public async getPreviewPage(filters: PreviewFilterRequest, page: number = 1, limit: number = 50) {
    const offset = (page - 1) * limit;
    const whereClause = await this.buildWhereClause(filters);

    const businesses = await this.client.directoryBusiness.findMany({
      where: whereClause,
      include: {
        prospectingLeads: {
          select: {
            respondedAt: true,
          },
          take: 1,
          orderBy: { createdAt: 'desc' as const },
        },
        prospectingMessages: {
          where: { direction: 'OUTBOUND' },
          select: { id: true },
          take: 1,
          orderBy: { createdAt: 'desc' as const },
        },
        category: {
          select: { name: true },
        },
      },
      orderBy: { name: 'asc' },
      take: limit,
      skip: offset,
    });

    const total = await this.client.directoryBusiness.count({ where: whereClause });

    return {
      data: businesses.map((b: any) => {
        const lastLead = b.prospectingLeads?.[0];
        const hasOutbound = (b.prospectingMessages?.length ?? 0) > 0;

        let status = 'Nunca enviado';
        if (lastLead?.respondedAt) {
          status = 'Respondeu';
        } else if (hasOutbound) {
          status = 'Já enviado';
        }

        return {
          publicId: b.publicId,
          name: b.name,
          category: b.category?.name || '',
          city: b.city,
          state: b.state,
          phone: b.whatsapp ? this.formatPhone(b.whatsapp) : '',
          status,
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

  public async getCountersForSelection(
    filters: PreviewFilterRequest,
    selectionMode: 'explicit' | 'allFiltered',
    businessPublicIds?: string[],
    excludedBusinessPublicIds?: string[]
  ): Promise<{ selected: number; total: number }> {
    if (selectionMode === 'explicit') {
      return {
        selected: businessPublicIds?.length || 0,
        total: businessPublicIds?.length || 0,
      };
    }

    const whereClause = await this.buildWhereClause(filters);
    const total = await this.client.directoryBusiness.count({ where: whereClause });
    const selected = Math.max(0, total - (excludedBusinessPublicIds?.length || 0));

    return { selected, total };
  }

  private async buildWhereClause(filters: PreviewFilterRequest) {
    const where: any = {
      active: true,
    };

    if (filters.categoryPublicIds && filters.categoryPublicIds.length > 0) {
      const categoryIds = await this.client.directoryCategory
        .findMany({
          where: { publicId: { in: filters.categoryPublicIds } },
          select: { id: true },
        })
        .then((cats) => cats.map((c) => c.id));
      where.categoryId = { in: categoryIds };
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

  public async resolveFilteredBusinessPublicIds(
    filters: PreviewFilterRequest,
    excludedPublicIds?: string[]
  ): Promise<string[]> {
    const whereClause = await this.buildWhereClause(filters);

    const businesses = await this.client.directoryBusiness.findMany({
      where: whereClause,
      select: { publicId: true },
      orderBy: { name: 'asc' },
    });

    const publicIds = businesses.map((b) => b.publicId);
    if (excludedPublicIds?.length) {
      const excludedSet = new Set(excludedPublicIds);
      return publicIds.filter((id) => !excludedSet.has(id));
    }

    return publicIds;
  }

  private formatPhone(phone: string): string {
    const normalized = normalizeWhatsAppPhone(phone);
    if (!normalized) return '';

    // Remove country code if present
    const digits = normalized.replace(/^55/, '');
    if (digits.length >= 10) {
      const ddd = digits.slice(0, 2);
      const part1 = digits.slice(2, 7);
      const part2 = digits.slice(7, 11);
      return `(${ddd}) ${part1}-${part2}`;
    }
    return phone;
  }
}
