import { createHash, randomUUID } from 'node:crypto';

import { PrismaClient, type Prisma } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { type DirectorySeoService } from './directory-seo.service.js';
import { evaluateDirectoryBusinessSeo } from './directory-seo-quality.js';
import { enqueueDirectoryCityAggregate } from './directory-city-aggregate-job.js';

const MAX_XML_BYTES = 8 * 1024 * 1024;
export const DIRECTORY_SITEMAP_PAGE_SIZE = 1_000;
export const directorySitemapPageCount = (total: number) =>
  Math.ceil(total / DIRECTORY_SITEMAP_PAGE_SIZE);
const knownCategories: Record<string, { slug: string; singular: string; plural: string }> = {
  barbearia: { slug: 'barbearias', singular: 'Barbearia', plural: 'Barbearias' },
  barba: { slug: 'barbearias', singular: 'Barbearia', plural: 'Barbearias' },
  barber: { slug: 'barbearias', singular: 'Barbearia', plural: 'Barbearias' },
  barbershop: { slug: 'barbearias', singular: 'Barbearia', plural: 'Barbearias' },
  salao: { slug: 'saloes-de-beleza', singular: 'Salão de Beleza', plural: 'Salões de Beleza' },
  'salao de beleza': {
    slug: 'saloes-de-beleza',
    singular: 'Salão de Beleza',
    plural: 'Salões de Beleza',
  },
  dentista: { slug: 'dentistas', singular: 'Dentista', plural: 'Dentistas' },
  estetica: { slug: 'estetica', singular: 'Estética', plural: 'Estética' },
};

export interface DirectorySourceRecord {
  sourceLocalId: string | null;
  businessType: string | null;
  segmentKey: string | null;
  searchTerm: string | null;
  name: string;
  rawAddress: string;
  city: string;
  state: string;
  ibgeCode: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  websiteUrl: string | null;
  sourceUrl: string | null;
  imageUrl: string | null;
  relevanceScore: number | null;
  reviewStatus: string | null;
}

function text(value: string | undefined): string | null {
  const trimmed = value
    ?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, '$1')
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .trim();
  return trimmed === undefined || trimmed === '' ? null : trimmed;
}

function tag(source: string, name: string): string | null {
  const match = new RegExp(
    `<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>|<${name}(?:\\s[^>]*)?\\s*\\/>`,
    'iu',
  ).exec(source);
  return text(match?.[1]);
}

function blocks(source: string, name: string): string[] {
  return [
    ...source.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${name}>`, 'giu')),
  ].map((match) => match[0]);
}

function attribute(source: string, name: string): string | null {
  const match = new RegExp(`${name}=["']([^"']+)["']`, 'iu').exec(source);
  return text(match?.[1]);
}

export function normalizeDirectoryPhone(value: string | null): string | null {
  if (value === null) return null;
  const rawDigits = value.replace(/\D/gu, '');
  const digits =
    rawDigits.startsWith('0') && rawDigits.length >= 11 ? rawDigits.slice(1) : rawDigits;
  if (digits.length < 10 || digits.length > 13) return null;
  return digits.startsWith('55') ? digits : `55${digits}`;
}

export function directorySlug(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/(^-|-$)/gu, '')
      .slice(0, 180) || 'estabelecimento'
  );
}

function sourceHash(record: DirectorySourceRecord): string {
  return createHash('sha256').update(JSON.stringify(record)).digest('hex');
}

function comparableText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
}

export function looksLikeApproximateDirectoryDuplicate(
  record: DirectorySourceRecord,
  candidate: { name: string; rawAddress: string },
): boolean {
  const name = comparableText(record.name);
  const otherName = comparableText(candidate.name);
  if (
    name.length >= 8 &&
    otherName.length >= 8 &&
    (name.includes(otherName) || otherName.includes(name))
  )
    return true;
  const number = /\b\d{1,5}\b/u.exec(record.rawAddress)?.[0];
  const words = comparableText(record.rawAddress)
    .split(' ')
    .filter((word) => word.length >= 5);
  const otherAddress = comparableText(candidate.rawAddress);
  return (
    number !== undefined &&
    otherAddress.includes(number) &&
    words.filter((word) => otherAddress.includes(word)).length >= 2
  );
}

export interface DirectoryMetricEvent {
  type: 'BUSINESS_VIEW' | 'WHATSAPP_CLICK';
  visitorHash: string | null;
  createdAt: Date;
}

export function aggregateDirectoryMetrics(events: DirectoryMetricEvent[]) {
  let pageViews = 0;
  let whatsappClicks = 0;
  let lastWhatsappClickAt: Date | null = null;
  const uniqueVisitors = new Set<string>();
  const daily = new Map<string, { date: string; pageViews: number; whatsappClicks: number }>();
  for (const event of events) {
    const date = event.createdAt.toISOString().slice(0, 10);
    const day = daily.get(date) ?? { date, pageViews: 0, whatsappClicks: 0 };
    if (event.type === 'BUSINESS_VIEW') {
      pageViews += 1;
      day.pageViews += 1;
    } else {
      whatsappClicks += 1;
      day.whatsappClicks += 1;
      if (event.visitorHash !== null) uniqueVisitors.add(event.visitorHash);
      if (lastWhatsappClickAt === null || event.createdAt > lastWhatsappClickAt)
        lastWhatsappClickAt = event.createdAt;
    }
    daily.set(date, day);
  }
  return {
    pageViews,
    whatsappClicks,
    uniqueWhatsappClicks: uniqueVisitors.size,
    whatsappCtr: pageViews === 0 ? 0 : whatsappClicks / pageViews,
    lastWhatsappClickAt,
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function extractDirectoryAddressParts(rawAddress: string) {
  const postalCode = /(?:CEP[:\s]*)?(\d{5})-?(\d{3})/iu.exec(rawAddress);
  const pieces = rawAddress
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const street = pieces[0] ?? null;
  const number = /(?:,|\s)(\d+[A-Za-z]?)\b/u.exec(rawAddress)?.[1] ?? null;
  const explicitNeighborhood = /(?:bairro[:\s]*)([^,\-]+)/iu.exec(rawAddress)?.[1]?.trim();
  const beforeCity = rawAddress.replace(/,\s*[^,]+\s*-\s*[A-Z]{2}(?:,.*)?$/u, '');
  const inferredNeighborhood = beforeCity.includes(' - ')
    ? beforeCity.split(' - ').at(-1)?.trim()
    : undefined;
  const neighborhood =
    explicitNeighborhood ??
    (inferredNeighborhood === '' ? undefined : inferredNeighborhood) ??
    null;
  return {
    street,
    number,
    neighborhood,
    postalCode: postalCode === null ? null : `${postalCode[1]}${postalCode[2]}`,
  };
}

function categoryCandidate(record: DirectorySourceRecord) {
  for (const candidate of [record.segmentKey, record.businessType, record.searchTerm]) {
    if (candidate === null) continue;
    const normalized = directorySlug(candidate).replace(/-/gu, ' ');
    const known = knownCategories[normalized] ?? knownCategories[normalized.replace(/s$/u, '')];
    if (known !== undefined) return known;
  }
  return null;
}

export function parseDirectoryXml(xml: Buffer): DirectorySourceRecord[] {
  if (xml.byteLength > MAX_XML_BYTES)
    throw new AppError({
      code: 'DIRECTORY_XML_TOO_LARGE',
      message: 'O XML excede o limite de 8 MB.',
      statusCode: 400,
    });
  const document = xml.toString('utf8');
  if (
    !/^\s*<\?xml|^\s*<local-commerce-data[\s>]/iu.test(document) ||
    /<!DOCTYPE|<!ENTITY|\bSYSTEM\b|\bPUBLIC\b/iu.test(document)
  ) {
    throw new AppError({
      code: 'DIRECTORY_XML_INVALID',
      message: 'Envie um XML válido, sem DTD ou entidades externas.',
      statusCode: 400,
    });
  }
  const records: DirectorySourceRecord[] = [];
  for (const cityBlock of blocks(document, 'city')) {
    const city = tag(cityBlock, 'name');
    const state = /(?:-|,)\s*([A-Z]{2})\s*$/u.exec(city ?? '')?.[1] ?? null;
    const cityName = (city ?? '').replace(/(?:-|,)\s*[A-Z]{2}\s*$/u, '').trim();
    if (cityName === '' || state === null) continue;
    for (const establishment of blocks(cityBlock, 'establishment')) {
      const name = tag(establishment, 'name');
      if (name === null) continue;
      const image = tag(establishment, 'image');
      records.push({
        sourceLocalId: attribute(establishment, 'local_id'),
        businessType: tag(establishment, 'business_type'),
        segmentKey: tag(establishment, 'segment_key'),
        searchTerm: tag(establishment, 'search_term'),
        name,
        rawAddress: tag(establishment, 'address') ?? '',
        city: cityName,
        state,
        ibgeCode: attribute(cityBlock, 'ibge_code'),
        phone: normalizeDirectoryPhone(tag(establishment, 'phone')),
        whatsapp: normalizeDirectoryPhone(tag(establishment, 'whatsapp')),
        email: tag(establishment, 'email'),
        websiteUrl: tag(establishment, 'website_url'),
        sourceUrl: tag(establishment, 'source_url'),
        imageUrl: image === null ? null : tag(image, 'url'),
        relevanceScore: Number(tag(establishment, 'relevance_score')) || null,
        reviewStatus: tag(establishment, 'review_status'),
      });
    }
  }
  if (records.length === 0)
    throw new AppError({
      code: 'DIRECTORY_XML_EMPTY',
      message: 'Não foram encontrados estabelecimentos válidos no XML.',
      statusCode: 400,
    });
  return records;
}

export class DirectoryService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly seo?: DirectorySeoService,
  ) {
    // Constructor does NOT initiate jobs or workers
    // Jobs are enqueued (persisted) but not auto-processed
    // Processing is triggered explicitly via endpoint or external scheduler
  }

  private categoryPublic(category: {
    publicId: string;
    name: string;
    singularName: string;
    pluralName: string;
    slug: string;
    description: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    icon: string | null;
    active: boolean;
    indexable: boolean;
    sortOrder: number;
    _count?: { businesses: number };
  }) {
    return {
      publicId: category.publicId,
      name: category.name,
      singularName: category.singularName,
      pluralName: category.pluralName,
      slug: category.slug,
      description: category.description,
      seoTitle: category.seoTitle,
      seoDescription: category.seoDescription,
      icon: category.icon,
      active: category.active,
      indexable: category.indexable,
      sortOrder: category.sortOrder,
      ...(category._count === undefined ? {} : { _count: category._count }),
    };
  }
  private businessPublic(business: {
    publicId: string;
    name: string;
    slug: string;
    citySlug: string;
    rawAddress: string;
    neighborhood: string | null;
    city: string;
    state: string;
    postalCode: string | null;
    phone: string | null;
    whatsapp: string | null;
    imageUrl: string | null;
    tenantId: bigint | null;
    category?: {
      publicId: string;
      name: string;
      singularName: string;
      pluralName: string;
      slug: string;
      description: string | null;
      seoTitle: string | null;
      seoDescription: string | null;
      icon: string | null;
      active: boolean;
      indexable: boolean;
      sortOrder: number;
    };
  }) {
    return {
      publicId: business.publicId,
      name: business.name,
      slug: business.slug,
      citySlug: business.citySlug,
      rawAddress: business.rawAddress,
      neighborhood: business.neighborhood,
      city: business.city,
      state: business.state,
      postalCode: business.postalCode,
      phone: business.phone,
      whatsapp: business.whatsapp,
      imageUrl: business.imageUrl,
      tenantId: business.tenantId === null ? null : 'linked',
      ...(business.category === undefined
        ? {}
        : { category: this.categoryPublic(business.category) }),
    };
  }
  private async approximateDuplicate(categoryId: bigint, record: DirectorySourceRecord) {
    const token = comparableText(record.name)
      .split(' ')
      .find((word) => word.length >= 4);
    if (token === undefined) return null;
    const candidates = await this.client.directoryBusiness.findMany({
      where: { categoryId, city: record.city, state: record.state },
      select: { id: true, name: true, rawAddress: true },
      take: 200,
    });
    return (
      candidates.find(
        (candidate) =>
          comparableText(candidate.name).includes(token) &&
          looksLikeApproximateDirectoryDuplicate(record, candidate),
      ) ?? null
    );
  }
  private eventHash(value: string | undefined): string | null {
    return value === undefined || value.trim() === ''
      ? null
      : createHash('sha256')
          .update(`${process.env.DIRECTORY_EVENT_SALT ?? 'agendei-directory-events'}:${value}`)
          .digest('hex');
  }
  public async recordEvent(
    publicId: string,
    input: {
      type: 'BUSINESS_VIEW' | 'WHATSAPP_CLICK';
      visitorId?: string | undefined;
      sessionId?: string | undefined;
      sourcePath: string;
      referrer?: string | undefined;
      utmSource?: string | undefined;
      utmMedium?: string | undefined;
      utmCampaign?: string | undefined;
    },
  ) {
    const business = await this.client.directoryBusiness.findFirst({
      where: { publicId, active: true },
      select: { id: true },
    });
    if (business === null)
      throw new AppError({
        code: 'DIRECTORY_BUSINESS_NOT_FOUND',
        message: 'Estabelecimento não encontrado.',
        statusCode: 404,
      });
    await this.client.directoryBusinessEvent.create({
      data: {
        publicId: randomUUID(),
        businessId: business.id,
        type: input.type,
        visitorHash: this.eventHash(input.visitorId),
        sessionHash: this.eventHash(input.sessionId),
        sourcePath: input.sourcePath.slice(0, 500),
        ...(input.referrer === undefined ? {} : { referrer: input.referrer.slice(0, 500) }),
        ...(input.utmSource === undefined ? {} : { utmSource: input.utmSource.slice(0, 160) }),
        ...(input.utmMedium === undefined ? {} : { utmMedium: input.utmMedium.slice(0, 160) }),
        ...(input.utmCampaign === undefined
          ? {}
          : { utmCampaign: input.utmCampaign.slice(0, 160) }),
      },
    });
  }
  public async metrics(
    input: {
      from?: Date | undefined;
      to?: Date | undefined;
      categorySlug?: string | undefined;
      state?: string | undefined;
      city?: string | undefined;
      search?: string | undefined;
      hasTenant?: boolean | undefined;
      businessPublicId?: string | undefined;
      page?: number | undefined;
      limit?: number | undefined;
    } = {},
  ) {
    const endOfDay =
      input.to === undefined
        ? undefined
        : new Date(
            Date.UTC(
              input.to.getUTCFullYear(),
              input.to.getUTCMonth(),
              input.to.getUTCDate(),
              23,
              59,
              59,
              999,
            ),
          );
    const eventWhere =
      input.from === undefined && endOfDay === undefined
        ? undefined
        : {
            createdAt: {
              ...(input.from === undefined ? {} : { gte: input.from }),
              ...(endOfDay === undefined ? {} : { lte: endOfDay }),
            },
          };
    const page = input.page ?? 1;
    const limit = input.limit ?? 25;
    const skip = (page - 1) * limit;

    const [businesses, totalCount] = await Promise.all([
      this.client.directoryBusiness.findMany({
        where: {
          ...(input.businessPublicId === undefined ? {} : { publicId: input.businessPublicId }),
          ...(input.categorySlug === undefined ? {} : { category: { slug: input.categorySlug } }),
          ...(input.state === undefined ? {} : { state: input.state }),
          ...(input.city === undefined ? {} : { city: input.city }),
          ...(input.search === undefined ? {} : { name: { contains: input.search } }),
          ...(input.hasTenant === undefined
            ? {}
            : { tenantId: input.hasTenant ? { not: null } : null }),
        },
        include: {
          category: true,
          events: {
            ...(eventWhere === undefined ? {} : { where: eventWhere }),
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      this.client.directoryBusiness.count({
        where: {
          ...(input.businessPublicId === undefined ? {} : { publicId: input.businessPublicId }),
          ...(input.categorySlug === undefined ? {} : { category: { slug: input.categorySlug } }),
          ...(input.state === undefined ? {} : { state: input.state }),
          ...(input.city === undefined ? {} : { city: input.city }),
          ...(input.search === undefined ? {} : { name: { contains: input.search } }),
          ...(input.hasTenant === undefined
            ? {}
            : { tenantId: input.hasTenant ? { not: null } : null }),
        },
      }),
    ]);
    const rows = businesses.map((business) => {
      const metrics = aggregateDirectoryMetrics(business.events);
      return {
        businessPublicId: business.publicId,
        business: business.name,
        category: business.category.pluralName,
        city: business.city,
        state: business.state,
        phone: business.phone,
        whatsapp: business.whatsapp,
        tenantLinked: business.tenantId !== null,
        ...metrics,
      };
    });
    rows.sort(
      (a, b) => b.whatsappClicks - a.whatsappClicks || a.business.localeCompare(b.business),
    );
    const summary = rows.reduce(
      (acc, row) => ({
        pageViews: acc.pageViews + row.pageViews,
        whatsappClicks: acc.whatsappClicks + row.whatsappClicks,
        uniqueWhatsappClicks: acc.uniqueWhatsappClicks + row.uniqueWhatsappClicks,
        businessesWithClicks: acc.businessesWithClicks + (row.whatsappClicks > 0 ? 1 : 0),
        prospectsWithClicks:
          acc.prospectsWithClicks + (!row.tenantLinked && row.whatsappClicks > 0 ? 1 : 0),
      }),
      {
        pageViews: 0,
        whatsappClicks: 0,
        uniqueWhatsappClicks: 0,
        businessesWithClicks: 0,
        prospectsWithClicks: 0,
      },
    );
    return {
      summary: {
        ...summary,
        whatsappCtr: summary.pageViews === 0 ? 0 : summary.whatsappClicks / summary.pageViews,
      },
      rows,
      ranking: rows.filter((row) => !row.tenantLinked && row.whatsappClicks > 0),
      detail: input.businessPublicId === undefined ? null : (rows[0] ?? null),
      total: totalCount,
      page,
      limit,
    };
  }

  public async analyze(filename: string, xml: Buffer) {
    const records = parseDirectoryXml(xml);
    const detected = new Map<
      string,
      { candidate: ReturnType<typeof categoryCandidate>; count: number }
    >();
    for (const record of records) {
      const candidate = categoryCandidate(record);
      const key =
        candidate?.slug ??
        `unknown:${record.segmentKey ?? record.businessType ?? record.searchTerm ?? 'unknown'}`;
      const current = detected.get(key);
      detected.set(key, { candidate, count: (current?.count ?? 0) + 1 });
    }
    const categorySlugs = [...detected.values()].flatMap((entry) =>
      entry.candidate === null ? [] : [entry.candidate.slug],
    );
    const categories = await this.client.directoryCategory.findMany({
      where: { slug: { in: categorySlugs } },
    });
    const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));
    const directoryImport = await this.client.directoryImport.create({
      data: {
        publicId: randomUUID(),
        filename,
        totalFound: records.length,
        items: {
          create: records.map((record, position) => {
            const candidate = categoryCandidate(record);
            const category = candidate === null ? undefined : categoryBySlug.get(candidate.slug);
            return {
              position,
              sourceLocalId: record.sourceLocalId,
              categoryDetected: candidate?.singular ?? record.businessType ?? record.segmentKey,
              categoryId: category?.id,
              sourceData: record as unknown as Prisma.InputJsonValue,
            };
          }),
        },
      },
    });
    return this.importStatus(directoryImport.publicId);
  }

  public async preview(publicId: string) {
    return this.importStatus(publicId);
  }

  public async importStatus(publicId: string) {
    const directoryImport = await this.client.directoryImport.findUnique({ where: { publicId } });
    if (directoryImport === null)
      throw new AppError({
        code: 'DIRECTORY_IMPORT_NOT_FOUND',
        message: 'Importação não encontrada.',
        statusCode: 404,
      });
    const grouped = await this.client.directoryImportItem.groupBy({
      by: ['categoryDetected'],
      where: { importId: directoryImport.id },
      _count: true,
    });
    const names = grouped.flatMap((item) =>
      item.categoryDetected === null ? [] : [item.categoryDetected],
    );
    const categories = await this.client.directoryCategory.findMany({
      where: { singularName: { in: names } },
      select: { slug: true, singularName: true, pluralName: true },
    });
    const categoryByName = new Map(categories.map((item) => [item.singularName, item]));
    const counts = await this.client.directoryImportItem.groupBy({
      by: ['status'],
      where: { importId: directoryImport.id },
      _count: true,
    });
    const categoryStatusCounts = await this.client.directoryImportItem.groupBy({
      by: ['categoryDetected', 'status'],
      where: { importId: directoryImport.id },
      _count: true,
    });
    const count = (status: string) => counts.find((item) => item.status === status)?._count ?? 0;
    const processedCount =
      count('CREATED') +
      count('UPDATED') +
      count('UNCHANGED') +
      count('POSSIBLE_DUPLICATE') +
      count('ERROR');
    const remaining = Math.max(directoryImport.totalSelected - processedCount, 0);
    const categoryCount = (detected: string, status: string) =>
      categoryStatusCounts.find(
        (item) =>
          (item.categoryDetected ?? 'Não classificado') === detected && item.status === status,
      )?._count ?? 0;
    return {
      import: {
        publicId: directoryImport.publicId,
        filename: directoryImport.filename,
        status:
          remaining === 0 && directoryImport.totalSelected > 0
            ? 'COMPLETED'
            : directoryImport.status,
        totalFound: directoryImport.totalFound,
        totalSelected: directoryImport.totalSelected,
        processedCount,
        totalCreated: count('CREATED'),
        totalUpdated: count('UPDATED'),
        totalUnchanged: count('UNCHANGED'),
        totalDuplicates: count('POSSIBLE_DUPLICATE'),
        errors: count('ERROR'),
        remaining,
        progressPercent:
          directoryImport.totalSelected === 0
            ? 0
            : Math.round((processedCount / directoryImport.totalSelected) * 10_000) / 100,
      },
      categories: grouped.map((item) => {
        const detected = item.categoryDetected ?? 'Não classificado';
        const category = categoryByName.get(detected);
        return {
          slug: category?.slug ?? null,
          name: category?.pluralName ?? detected,
          detected,
          count: item._count,
          existing: category !== undefined,
          created: categoryCount(detected, 'CREATED'),
          updated: categoryCount(detected, 'UPDATED'),
          unchanged: categoryCount(detected, 'UNCHANGED'),
          duplicates: categoryCount(detected, 'POSSIBLE_DUPLICATE'),
        };
      }),
    };
  }

  public async imports() {
    return this.client.directoryImport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        publicId: true,
        filename: true,
        status: true,
        totalFound: true,
        totalSelected: true,
        processedCount: true,
        totalCreated: true,
        totalUpdated: true,
        totalUnchanged: true,
        totalDuplicates: true,
        createdAt: true,
      },
    });
  }
  public async createCategory(input: {
    name: string;
    singularName: string;
    pluralName: string;
    slug: string;
    description?: string | undefined;
    icon?: string | undefined;
    active?: boolean | undefined;
    indexable?: boolean | undefined;
  }) {
    const slug = directorySlug(input.slug);
    return this.client.directoryCategory.upsert({
      where: { slug },
      update: {
        name: input.name,
        singularName: input.singularName,
        pluralName: input.pluralName,
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.icon === undefined ? {} : { icon: input.icon }),
        active: input.active ?? true,
        indexable: input.indexable ?? true,
      },
      create: {
        publicId: randomUUID(),
        name: input.name,
        singularName: input.singularName,
        pluralName: input.pluralName,
        slug,
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.icon === undefined ? {} : { icon: input.icon }),
        active: input.active ?? true,
        indexable: input.indexable ?? true,
      },
    });
  }

  public async configure(
    publicId: string,
    assignments: { detected: string; categorySlug: string }[],
    newCategories: {
      name: string;
      singularName: string;
      pluralName: string;
      slug: string;
      active?: boolean | undefined;
      indexable?: boolean | undefined;
    }[],
  ) {
    const directoryImport = await this.client.directoryImport.findUnique({ where: { publicId } });
    if (directoryImport === null)
      throw new AppError({
        code: 'DIRECTORY_IMPORT_NOT_FOUND',
        message: 'Importação não encontrada.',
        statusCode: 404,
      });
    if (
      directoryImport.processedCount > 0 ||
      ['PROCESSING', 'PAUSED', 'COMPLETED'].includes(directoryImport.status)
    )
      throw new AppError({
        code: 'DIRECTORY_IMPORT_ALREADY_STARTED',
        message: 'A importação já foi iniciada e não pode ser reconfigurada.',
        statusCode: 409,
      });
    const created = await Promise.all(
      newCategories.map((category) =>
        this.client.directoryCategory.upsert({
          where: { slug: directorySlug(category.slug) },
          update: {
            name: category.name,
            singularName: category.singularName,
            pluralName: category.pluralName,
            active: category.active ?? true,
            indexable: category.indexable ?? true,
          },
          create: {
            publicId: randomUUID(),
            name: category.name,
            singularName: category.singularName,
            pluralName: category.pluralName,
            slug: directorySlug(category.slug),
            active: category.active ?? true,
            indexable: category.indexable ?? true,
          },
        }),
      ),
    );
    const categories = await this.client.directoryCategory.findMany({
      where: {
        slug: {
          in: [
            ...assignments.map((assignment) => directorySlug(assignment.categorySlug)),
            ...created.map((category) => category.slug),
          ],
        },
      },
    });
    const bySlug = new Map(categories.map((category) => [category.slug, category]));
    const selectedDetected: string[] = [];
    for (const assignment of assignments) {
      const category = bySlug.get(directorySlug(assignment.categorySlug));
      if (category === undefined) continue;
      selectedDetected.push(assignment.detected);
      await this.client.directoryImportItem.updateMany({
        where: { importId: directoryImport.id, categoryDetected: assignment.detected },
        data: { categoryId: category.id, status: 'SKIPPED', message: null },
      });
    }
    await this.client.directoryImportItem.updateMany({
      where: {
        importId: directoryImport.id,
        ...(selectedDetected.length === 0 ? {} : { categoryDetected: { notIn: selectedDetected } }),
      },
      data: { categoryId: null, status: 'SKIPPED', message: 'Categoria não selecionada' },
    });
    const selected = await this.client.directoryImportItem.count({
      where: { importId: directoryImport.id, categoryId: { not: null } },
    });
    await this.client.directoryImport.update({
      where: { id: directoryImport.id },
      data: { status: 'QUEUED', totalSelected: selected, processedCount: 0 },
    });
    return this.importStatus(publicId);
  }

  public async processBatch(
    publicId: string,
    batchSize = Math.min(Math.max(Number(process.env.DIRECTORY_IMPORT_BATCH_SIZE ?? 25), 1), 100),
  ) {
    const directoryImport = await this.client.directoryImport.findUnique({ where: { publicId } });
    if (directoryImport === null)
      throw new AppError({
        code: 'DIRECTORY_IMPORT_NOT_FOUND',
        message: 'Importação não encontrada.',
        statusCode: 404,
      });
    if (directoryImport.status === 'PAUSED' || directoryImport.status === 'COMPLETED')
      return this.preview(publicId);
    const staleBefore = new Date(Date.now() - 2 * 60_000);
    const claim = await this.client.directoryImport.updateMany({
      where: {
        id: directoryImport.id,
        OR: [{ status: 'QUEUED' }, { status: 'PROCESSING', updatedAt: { lte: staleBefore } }],
      },
      data: { status: 'PROCESSING' },
    });
    if (claim.count === 0) return this.preview(publicId);
    const items = await this.client.directoryImportItem.findMany({
      where: { importId: directoryImport.id, categoryId: { not: null }, status: 'SKIPPED' },
      take: batchSize,
      orderBy: { position: 'asc' },
      include: { category: true },
    });
    for (const item of items) {
      try {
        await this.processItem(item);
      } catch (error) {
        await this.client.directoryImportItem.update({
          where: { id: item.id },
          data: { status: 'ERROR', message: String(error).slice(0, 500) },
        });
      }
    }
    const remaining = await this.client.directoryImportItem.count({
      where: { importId: directoryImport.id, categoryId: { not: null }, status: 'SKIPPED' },
    });
    const counts = await this.client.directoryImportItem.groupBy({
      by: ['status'],
      where: { importId: directoryImport.id },
      _count: true,
    });
    const count = (status: string) => counts.find((entry) => entry.status === status)?._count ?? 0;
    const processedCount =
      count('CREATED') +
      count('UPDATED') +
      count('UNCHANGED') +
      count('POSSIBLE_DUPLICATE') +
      count('ERROR');
    await this.client.directoryImport.update({
      where: { id: directoryImport.id },
      data: {
        processedCount,
        totalCreated: count('CREATED'),
        totalUpdated: count('UPDATED'),
        totalUnchanged: count('UNCHANGED'),
        totalDuplicates: count('POSSIBLE_DUPLICATE'),
        status: remaining === 0 ? 'COMPLETED' : 'QUEUED',
        ...(remaining === 0 ? { completedAt: new Date() } : {}),
      },
    });
    const preview = await this.preview(publicId);
    return {
      ...preview,
      remaining,
      progressPercent:
        directoryImport.totalSelected === 0
          ? 100
          : Math.round((preview.import.processedCount / directoryImport.totalSelected) * 10_000) /
            100,
      batchProcessed: items.length,
      errors: count('ERROR'),
      completedWithErrors: remaining === 0 && count('ERROR') > 0,
    };
  }

  private async processItem(
    item: Awaited<ReturnType<PrismaClient['directoryImportItem']['findMany']>>[number] & {
      category: { id: bigint; active: boolean; indexable: boolean } | null;
    },
  ) {
    if (item.category === null) return;
    const record = item.sourceData as unknown as DirectorySourceRecord;
    const hash = sourceHash(record);
    const address = extractDirectoryAddressParts(record.rawAddress);
    const citySlug = directorySlug(`${record.city}-${record.state}`);
    const slug = directorySlug(record.name);
    const exact = await this.client.directoryBusiness.findFirst({
      where: {
        categoryId: item.category.id,
        OR: [
          ...(record.whatsapp === null ? [] : [{ whatsapp: record.whatsapp }]),
          ...(record.phone === null ? [] : [{ phone: record.phone }]),
          { name: record.name, city: record.city, state: record.state },
        ],
      },
    });
    if (
      exact !== null &&
      exact.sourceHash === hash &&
      (address.neighborhood === null || exact.neighborhood !== null) &&
      (address.postalCode === null || exact.postalCode === address.postalCode)
    ) {
      await this.client.directoryImportItem.update({
        where: { id: item.id },
        data: { businessId: exact.id, status: 'UNCHANGED' },
      });
      return;
    }
    if (exact !== null) {
      const data = {
        sourceLocalId: record.sourceLocalId ?? exact.sourceLocalId,
        sourceSegmentKey: record.segmentKey ?? exact.sourceSegmentKey,
        sourceSearchTerm: record.searchTerm ?? exact.sourceSearchTerm,
        rawAddress: record.rawAddress || exact.rawAddress,
        street: address.street ?? exact.street,
        number: address.number ?? exact.number,
        neighborhood: address.neighborhood ?? exact.neighborhood,
        postalCode: address.postalCode ?? exact.postalCode,
        phone: record.phone ?? exact.phone,
        whatsapp: record.whatsapp ?? exact.whatsapp,
        email: record.email ?? exact.email,
        websiteUrl: record.websiteUrl ?? exact.websiteUrl,
        imageUrl: record.imageUrl ?? exact.imageUrl,
        sourceUrl: record.sourceUrl ?? exact.sourceUrl,
        relevanceScore: record.relevanceScore ?? exact.relevanceScore,
        reviewStatus: record.reviewStatus ?? exact.reviewStatus,
        sourceHash: hash,
        lastImportedAt: new Date(),
      };

      // Evaluate SEO quality for updated business
      const seoEval = evaluateDirectoryBusinessSeo({
        active: exact.active,
        indexable: exact.indexable,
        name: exact.name,
        city: exact.city,
        state: exact.state,
        rawAddress: data.rawAddress,
        neighborhood: data.neighborhood,
        postalCode: data.postalCode,
        phone: data.phone,
        whatsapp: data.whatsapp,
        websiteUrl: data.websiteUrl,
        tenantId: exact.tenantId,
        categoryActive: item.category.active,
        categoryIndexable: item.category.indexable,
      });

      const business = await this.client.directoryBusiness.update({
        where: { id: exact.id },
        data: {
          ...data,
          seoQualityScore: seoEval.score,
          seoEligible: seoEval.eligible,
          seoEvaluatedAt: new Date(),
        },
        include: { category: { select: { slug: true } } },
      });
      await this.client.directoryImportItem.update({
        where: { id: item.id },
        data: { businessId: business.id, status: 'UPDATED' },
      });
      await this.seo?.enqueueBusiness(business, 'UPDATED').catch(() => undefined);

      // Enqueue city aggregate refresh (persisted, deduped)
      await enqueueDirectoryCityAggregate(this.client, exact.categoryId, exact.citySlug);
      return;
    }
    const approximate = await this.approximateDuplicate(item.category.id, record);
    if (approximate !== null) {
      await this.client.directoryImportItem.update({
        where: { id: item.id },
        data: {
          businessId: approximate.id,
          status: 'POSSIBLE_DUPLICATE',
          message: 'Possível duplicidade por nome/endereço; revise antes de fundir.',
        },
      });
      return;
    }
    // Evaluate SEO quality for new business
    const seoEval = evaluateDirectoryBusinessSeo({
      active: true, // New businesses are active by default
      indexable: true, // New businesses are indexable by default
      name: record.name,
      city: record.city,
      state: record.state,
      rawAddress: record.rawAddress,
      neighborhood: address.neighborhood,
      postalCode: address.postalCode,
      phone: record.phone,
      whatsapp: record.whatsapp,
      websiteUrl: record.websiteUrl,
      tenantId: null,
      categoryActive: item.category.active,
      categoryIndexable: item.category.indexable,
    });

    const business = await this.client.directoryBusiness.create({
      data: {
        publicId: randomUUID(),
        categoryId: item.category.id,
        sourceLocalId: record.sourceLocalId,
        sourceSegmentKey: record.segmentKey,
        sourceSearchTerm: record.searchTerm,
        name: record.name,
        slug,
        citySlug,
        rawAddress: record.rawAddress,
        street: address.street,
        number: address.number,
        neighborhood: address.neighborhood,
        city: record.city,
        state: record.state,
        postalCode: address.postalCode,
        ibgeCode: record.ibgeCode,
        phone: record.phone,
        whatsapp: record.whatsapp,
        email: record.email,
        websiteUrl: record.websiteUrl,
        imageUrl: record.imageUrl,
        sourceUrl: record.sourceUrl,
        relevanceScore: record.relevanceScore,
        reviewStatus: record.reviewStatus,
        sourceHash: hash,
        seoQualityScore: seoEval.score,
        seoEligible: seoEval.eligible,
        seoEvaluatedAt: new Date(),
      },
      include: { category: { select: { slug: true } } },
    });
    await this.client.directoryImportItem.update({
      where: { id: item.id },
      data: { businessId: business.id, status: 'CREATED' },
    });
    await this.seo?.enqueueBusiness(business, 'CREATED').catch(() => undefined);

    // Enqueue city aggregate refresh (persisted, deduped)
    await enqueueDirectoryCityAggregate(this.client, item.category.id, citySlug);
  }

  public async pause(publicId: string) {
    const found = await this.client.directoryImport.update({
      where: { publicId },
      data: { status: 'PAUSED' },
    });
    return this.preview(found.publicId);
  }
  public async resume(publicId: string) {
    const found = await this.client.directoryImport.update({
      where: { publicId },
      data: { status: 'QUEUED', completedAt: null },
    });
    return this.preview(found.publicId);
  }
  public async retryErrors(publicId: string) {
    const directoryImport = await this.client.directoryImport.findUnique({ where: { publicId } });
    if (directoryImport === null)
      throw new AppError({
        code: 'DIRECTORY_IMPORT_NOT_FOUND',
        message: 'Importação não encontrada.',
        statusCode: 404,
      });
    const retried = await this.client.directoryImportItem.updateMany({
      where: { importId: directoryImport.id, status: 'ERROR' },
      data: { status: 'SKIPPED', message: null },
    });
    await this.client.directoryImport.update({
      where: { id: directoryImport.id },
      data: {
        status: 'QUEUED',
        completedAt: null,
        ...(retried.count > 0 ? { processedCount: { decrement: retried.count } } : {}),
      },
    });
    return this.preview(publicId);
  }
  public async importErrors(publicId: string) {
    const directoryImport = await this.client.directoryImport.findUnique({
      where: { publicId },
      select: { id: true },
    });
    if (directoryImport === null)
      throw new AppError({
        code: 'DIRECTORY_IMPORT_NOT_FOUND',
        message: 'Importação não encontrada.',
        statusCode: 404,
      });
    const items = await this.client.directoryImportItem.findMany({
      where: { importId: directoryImport.id, status: 'ERROR' },
      orderBy: { position: 'asc' },
      select: { position: true, sourceData: true, message: true, status: true },
    });
    return items.map((item) => {
      const source = item.sourceData as unknown as DirectorySourceRecord;
      return {
        position: item.position,
        name: source.name,
        city: source.city,
        state: source.state,
        status: item.status,
        message: item.message ?? 'Erro sem detalhe.',
      };
    });
  }
  public async categories() {
    const categories = await this.client.directoryCategory.findMany({
      where: { active: true, businesses: { some: { active: true } } },
      orderBy: [{ sortOrder: 'asc' }, { pluralName: 'asc' }],
      include: { _count: { select: { businesses: { where: { active: true } } } } },
    });
    return categories.map((category) => this.categoryPublic(category));
  }
  public async adminCategories() {
    const categories = await this.client.directoryCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { pluralName: 'asc' }],
      include: { _count: { select: { businesses: true } } },
    });
    return categories.map((cat) => this.adminCategoryPublic(cat));
  }

  private adminCategoryPublic(cat: any): any {
    return {
      publicId: cat.publicId,
      name: cat.name,
      singularName: cat.singularName,
      pluralName: cat.pluralName,
      slug: cat.slug,
      description: cat.description,
      icon: cat.icon,
      active: cat.active,
      indexable: cat.indexable,
      sortOrder: cat.sortOrder,
      geoapifyCategories: Array.isArray(cat.geoapifyCategories) ? cat.geoapifyCategories : null,
      externalSearchTerms: Array.isArray(cat.externalSearchTerms) ? cat.externalSearchTerms : null,
      _count: cat._count,
    };
  }
  public async updateCategory(
    publicId: string,
    input: {
      name?: string | undefined;
      singularName?: string | undefined;
      pluralName?: string | undefined;
      description?: string | null | undefined;
      icon?: string | null | undefined;
      active?: boolean | undefined;
      indexable?: boolean | undefined;
      sortOrder?: number | undefined;
      geoapifyCategories?: string[] | null | undefined;
      externalSearchTerms?: string[] | null | undefined;
    },
  ) {
    // Check if active or indexable will change
    const current = await this.client.directoryCategory.findFirst({ where: { publicId } });
    const willChangeActiveOrIndexable =
      (input.active !== undefined && input.active !== current?.active) ||
      (input.indexable !== undefined && input.indexable !== current?.indexable);

    // Update category
    const category = await this.client.directoryCategory.update({
      where: { publicId },
      data: Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)),
      include: { _count: { select: { businesses: true } } },
    });

    // If active or indexable changed, mark all businesses for SEO recalculation
    if (willChangeActiveOrIndexable) {
      await this.client.directoryBusiness.updateMany({
        where: { categoryId: category.id },
        data: { seoEvaluatedAt: null },
      });
    }

    return this.adminCategoryPublic(category);
  }
  public async adminBusinesses(page: number, limit: number) {
    const [total, items] = await Promise.all([
      this.client.directoryBusiness.count(),
      this.client.directoryBusiness.findMany({
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { category: true },
      }),
    ]);
    return {
      items: items.map((item) => this.adminBusinessPublic(item)),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  private adminBusinessPublic(item: any): any {
    return {
      publicId: item.publicId,
      name: item.name,
      city: item.city,
      state: item.state,
      active: item.active,
      indexable: item.indexable,
      category: item.category ? this.adminCategoryPublic(item.category) : null,
    };
  }
  public async updateBusiness(
    publicId: string,
    input: {
      active?: boolean | undefined;
      indexable?: boolean | undefined;
      tenantId?: bigint | null | undefined;
    },
  ) {
    // Fetch current business to get full data for SEO evaluation
    const current = await this.client.directoryBusiness.findFirst({
      where: { publicId },
      include: { category: true },
    });

    if (!current) {
      throw new AppError({
        code: 'DIRECTORY_BUSINESS_NOT_FOUND',
        message: 'Negócio não encontrado.',
        statusCode: 404,
      });
    }

    // Prepare updated business data
    const updated = {
      ...current,
      ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)),
    };

    // Evaluate SEO with updated data
    const seoEval = evaluateDirectoryBusinessSeo({
      active: updated.active,
      indexable: updated.indexable,
      name: updated.name,
      city: updated.city,
      state: updated.state,
      rawAddress: updated.rawAddress,
      neighborhood: updated.neighborhood,
      postalCode: updated.postalCode,
      phone: updated.phone,
      whatsapp: updated.whatsapp,
      websiteUrl: updated.websiteUrl,
      tenantId: input.tenantId ?? current.tenantId,
      categoryActive: updated.category.active,
      categoryIndexable: updated.category.indexable,
    });

    // Remember old eligibility to detect changes
    const wasEligible = (current as any).seoEligible ?? false;

    // Perform update with new SEO scores
    const business = await this.client.directoryBusiness.update({
      where: { publicId },
      data: {
        ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)),
        seoQualityScore: seoEval.score,
        seoEligible: seoEval.eligible,
        seoEvaluatedAt: new Date(),
      },
      include: { category: true },
    });

    // If eligibility changed, enqueue city aggregate refresh (persisted, deduped)
    if (wasEligible !== seoEval.eligible) {
      await enqueueDirectoryCityAggregate(this.client, business.categoryId, business.citySlug);
    }

    // If city or category changed, enqueue BOTH old and new aggregates
    if (current.categoryId !== business.categoryId || current.citySlug !== business.citySlug) {
      await enqueueDirectoryCityAggregate(this.client, current.categoryId, current.citySlug);
      await enqueueDirectoryCityAggregate(this.client, business.categoryId, business.citySlug);
    }

    return business;
  }
  public async categoryCities(slug: string) {
    const category = await this.client.directoryCategory.findFirst({
      where: { slug, active: true },
    });
    if (category === null)
      throw new AppError({
        code: 'DIRECTORY_CATEGORY_NOT_FOUND',
        message: 'Categoria não encontrada.',
        statusCode: 404,
      });
    const rows = await this.client.directoryBusiness.groupBy({
      by: ['city', 'state', 'citySlug'],
      where: { categoryId: category.id, active: true },
      _count: true,
      orderBy: { _count: { city: 'desc' } },
    });
    return {
      category: this.categoryPublic(category),
      cities: rows.map((row) => ({
        city: row.city,
        state: row.state,
        citySlug: row.citySlug,
        count: row._count,
      })),
    };
  }
  public async cityBusinesses(categorySlug: string, citySlug: string, page: number, limit: number) {
    const category = await this.client.directoryCategory.findFirst({
      where: { slug: categorySlug, active: true },
    });
    if (category === null)
      throw new AppError({
        code: 'DIRECTORY_CATEGORY_NOT_FOUND',
        message: 'Categoria não encontrada.',
        statusCode: 404,
      });

    // Optimized: Use DirectoryCityAggregate for neighborhoods & whatsapp count
    const [aggregate, items, total] = await Promise.all([
      this.client.directoryCityAggregate.findFirst({
        where: { categoryId: category.id, citySlug },
      }),
      this.client.directoryBusiness.findMany({
        where: { categoryId: category.id, citySlug, active: true },
        orderBy: [{ relevanceScore: 'desc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.client.directoryBusiness.count({
        where: { categoryId: category.id, citySlug, active: true },
      }),
    ]);

    // Use aggregate data for neighborhoods and whatsapp count
    const neighborhoods = aggregate?.topNeighborhoods as Array<{ name: string; count: number }> || [];
    const whatsappCount = aggregate?.whatsappCount ?? 0;

    return {
      category: this.categoryPublic(category),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      stats: {
        whatsappCount,
        neighborhoods,
      },
      items: items.map((item) => this.businessPublic(item)),
    };
  }
  public async business(categorySlug: string, citySlug: string, slug: string) {
    const result = await this.client.directoryBusiness.findFirst({
      where: { category: { slug: categorySlug, active: true }, citySlug, slug, active: true },
      include: { category: true },
    });
    if (result === null)
      throw new AppError({
        code: 'DIRECTORY_BUSINESS_NOT_FOUND',
        message: 'Estabelecimento não encontrado.',
        statusCode: 404,
      });
    return this.businessPublic(result);
  }
  private readonly sitemapCategoryWhere = {
    active: true,
    indexable: true,
    // Category included if it has at least 1 SEO-eligible business
    cityAggregates: { some: { seoEligible: true } },
  };
  private readonly sitemapBusinessWhere = {
    active: true,
    indexable: true,
    seoEligible: true,
    category: { active: true, indexable: true },
  };

  private async sitemapCounts() {
    const [categories, businesses, cities] = await Promise.all([
      this.client.directoryCategory.count({ where: this.sitemapCategoryWhere }),
      this.client.directoryBusiness.count({ where: this.sitemapBusinessWhere }),
      this.client.directoryCityAggregate.count({ where: { seoEligible: true } }),
    ]);
    return {
      categories,
      cities,
      businesses,
      total: businesses === 0 ? 0 : 1 + categories + cities + businesses,
    };
  }

  public async sitemapSummary() {
    const counts = await this.sitemapCounts();
    return {
      total: counts.total,
      pageSize: DIRECTORY_SITEMAP_PAGE_SIZE,
      pageCount: directorySitemapPageCount(counts.total),
    };
  }

  public async sitemapPage(page: number) {
    const counts = await this.sitemapCounts();
    const pageCount = directorySitemapPageCount(counts.total);
    if (!Number.isInteger(page) || page < 1 || page > pageCount)
      return {
        total: counts.total,
        pageCount,
        urls: [] as { path: string; updatedAt: Date | null }[],
      };

    let skip = (page - 1) * DIRECTORY_SITEMAP_PAGE_SIZE;
    let remaining = DIRECTORY_SITEMAP_PAGE_SIZE;
    const urls: { path: string; updatedAt: Date | null }[] = [];
    const takeFrom = (count: number) => {
      if (remaining === 0) return { skip: 0, take: 0 };
      if (skip >= count) {
        skip -= count;
        return { skip: 0, take: 0 };
      }
      const segmentSkip = skip;
      const take = Math.min(remaining, count - segmentSkip);
      skip = 0;
      remaining -= take;
      return { skip: segmentSkip, take };
    };

    const root = takeFrom(counts.businesses === 0 ? 0 : 1);
    if (root.take === 1) urls.push({ path: '/encontre', updatedAt: null });

    const categoriesPage = takeFrom(counts.categories);
    if (categoriesPage.take > 0) {
      const categories = await this.client.directoryCategory.findMany({
        where: this.sitemapCategoryWhere,
        orderBy: { id: 'asc' },
        skip: categoriesPage.skip,
        take: categoriesPage.take,
        select: { slug: true, updatedAt: true },
      });
      urls.push(
        ...categories.map((category) => ({
          path: `/encontre/${category.slug}`,
          updatedAt: category.updatedAt,
        })),
      );
    }

    const citiesPage = takeFrom(counts.cities);
    if (citiesPage.take > 0) {
      // Use DirectoryCityAggregate for optimized city listing
      const cities = await this.client.directoryCityAggregate.findMany({
        where: { seoEligible: true },
        orderBy: [{ categoryId: 'asc' }, { citySlug: 'asc' }],
        skip: citiesPage.skip,
        take: citiesPage.take,
        select: {
          categoryId: true,
          citySlug: true,
          lastBusinessUpdatedAt: true,
          category: { select: { slug: true } },
        },
      });
      urls.push(
        ...cities.map((city) => ({
          path: `/encontre/${city.category.slug}/${city.citySlug}`,
          updatedAt: city.lastBusinessUpdatedAt,
        })),
      );
    }

    const businessesPage = takeFrom(counts.businesses);
    if (businessesPage.take > 0) {
      const businesses = await this.client.directoryBusiness.findMany({
        where: this.sitemapBusinessWhere,
        orderBy: { id: 'asc' },
        skip: businessesPage.skip,
        take: businessesPage.take,
        select: {
          slug: true,
          citySlug: true,
          updatedAt: true,
          category: { select: { slug: true } },
        },
      });
      urls.push(
        ...businesses.map((business) => ({
          path: `/encontre/${business.category.slug}/${business.citySlug}/${business.slug}`,
          updatedAt: business.updatedAt,
        })),
      );
    }
    return {
      total: counts.total,
      pageCount,
      urls: [...new Map(urls.map((url) => [url.path, url])).values()],
    };
  }
}
