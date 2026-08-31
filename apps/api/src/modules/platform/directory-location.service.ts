import { createHash } from 'node:crypto';

import { PrismaClient, type Prisma } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

export interface DirectorySearchResult { source: 'DIRECTORY' | 'GEOAPIFY'; publicId: string | null; name: string; address: string; city: string; state: string; neighborhood: string | null; phone: string | null; whatsapp: string | null; website: string | null; latitude: number | null; longitude: number | null; distanceMeters: number | null; }
export interface DirectoryGeocodeMetrics { attempted: boolean; success: boolean; source: 'CACHE' | 'BRASILAPI' | 'VIACEP' | 'GEOAPIFY' | null; httpStatus?: number; featuresReceived?: number; apiKeyAvailable?: boolean; requestAttempted?: boolean; requestUrlHost?: string | null; errorType?: string; errorCode?: string; errorMessage?: string; durationMs?: number; }
export interface DirectoryPlacesMetrics { attempted: boolean; httpStatus?: number; featuresReceived?: number; acceptedResults?: number; }
export interface DirectorySearchDiagnostics { geocoding: DirectoryGeocodeMetrics; places: DirectoryPlacesMetrics; }
export interface DirectorySearchResultWithDiagnostics { location: { cep: string; city: string; state: string; latitude: number | null; longitude: number | null }; results: DirectorySearchResult[]; cityUrl: string; diagnostics: DirectorySearchDiagnostics; }
type Location = { cep: string; city: string; state: string; neighborhood: string | null; street: string | null; latitude: number | null; longitude: number | null };
type GeoFeature = { properties?: Record<string, unknown>; geometry?: { coordinates?: unknown } };

const cepValue = (value: string) => value.replace(/\D/gu, '');
const jsonStrings = (value: Prisma.JsonValue | null) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const timeoutFetch = async (url: string, timeoutMs: number) => fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
const text = (value: unknown) => typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const norm = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().replace(/[^a-z0-9]/gu, '');

export class DirectoryLocationService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly options: {
      geoapifyApiKeyProvider?: () => Promise<string | undefined>;
      localMinResults?: number;
    } = {},
  ) {}

  public async search(categorySlug: string, rawCep: string) {
    const cep = cepValue(rawCep);
    if (!/^\d{8}$/u.test(cep)) throw new AppError({ code: 'DIRECTORY_INVALID_CEP', message: 'Informe um CEP válido.', statusCode: 400 });
    const location = await this.resolveCep(cep);
    const category = await this.client.directoryCategory.findFirst({ where: { slug: categorySlug, active: true } });
    if (category === null) throw new AppError({ code: 'DIRECTORY_CATEGORY_NOT_FOUND', message: 'Categoria não encontrada.', statusCode: 404 });
    const cityNorm = norm(location.city);
    const local = await this.client.directoryBusiness.findMany({ where: { categoryId: category.id, state: location.state, active: true }, orderBy: [{ relevanceScore: 'desc' }, { name: 'asc' }], take: 50 }).then((results) => results.filter((item) => norm(item.city) === cityNorm).slice(0, 10));
    const localResults: DirectorySearchResult[] = local.map((item) => ({ source: 'DIRECTORY', publicId: item.publicId, name: item.name, address: item.rawAddress, city: item.city, state: item.state, neighborhood: item.neighborhood, phone: item.phone, whatsapp: item.whatsapp, website: item.websiteUrl, latitude: null, longitude: null, distanceMeters: null }));
    const minimum = this.options.localMinResults ?? 5;
    const external = localResults.length >= minimum ? [] : await this.geoapify(category.id, category.geoapifyCategories, category.externalSearchTerms, location);
    const results = this.dedupe([...localResults, ...external]).slice(0, 10);
    return { location, results, cityUrl: `/encontre/${category.slug}/${this.slug(`${location.city}-${location.state}`)}` };
  }

  public async searchWithDiagnostics(categorySlug: string, rawCep: string): Promise<DirectorySearchResultWithDiagnostics> {
    const cep = cepValue(rawCep);
    if (!/^\d{8}$/u.test(cep)) throw new AppError({ code: 'DIRECTORY_INVALID_CEP', message: 'Informe um CEP válido.', statusCode: 400 });
    const diagnostics: DirectorySearchDiagnostics = {
      geocoding: { attempted: false, success: false, source: null },
      places: { attempted: false },
    };
    const location = await this.resolveCepWithDiagnostics(cep, diagnostics.geocoding);
    const category = await this.client.directoryCategory.findFirst({ where: { slug: categorySlug, active: true } });
    if (category === null) throw new AppError({ code: 'DIRECTORY_CATEGORY_NOT_FOUND', message: 'Categoria não encontrada.', statusCode: 404 });
    const cityNorm = norm(location.city);
    const local = await this.client.directoryBusiness.findMany({ where: { categoryId: category.id, state: location.state, active: true }, orderBy: [{ relevanceScore: 'desc' }, { name: 'asc' }], take: 50 }).then((results) => results.filter((item) => norm(item.city) === cityNorm).slice(0, 10));
    const localResults: DirectorySearchResult[] = local.map((item) => ({ source: 'DIRECTORY', publicId: item.publicId, name: item.name, address: item.rawAddress, city: item.city, state: item.state, neighborhood: item.neighborhood, phone: item.phone, whatsapp: item.whatsapp, website: item.websiteUrl, latitude: null, longitude: null, distanceMeters: null }));
    const minimum = this.options.localMinResults ?? 5;
    const external = localResults.length >= minimum ? [] : await this.geoapifyWithDiagnostics(category.id, category.geoapifyCategories, category.externalSearchTerms, location, diagnostics.places);
    const results = this.dedupe([...localResults, ...external]).slice(0, 10);
    return {
      location: {
        cep: location.cep,
        city: location.city,
        state: location.state,
        latitude: location.latitude,
        longitude: location.longitude,
      },
      results,
      cityUrl: `/encontre/${category.slug}/${this.slug(`${location.city}-${location.state}`)}`,
      diagnostics,
    };
  }

  private async resolveCep(cep: string): Promise<Location> {
    const cached = await this.client.directoryPostalCodeCache.findUnique({ where: { cep } });
    if (cached !== null && cached.updatedAt > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)) {
      let location = this.toLocation(cached);
      if (location.latitude === null || location.longitude === null) {
        const geocoded = await this.geoapifyGeocode(location);
        if (geocoded !== null) {
          await this.client.directoryPostalCodeCache.update({ where: { cep }, data: { latitude: geocoded.latitude, longitude: geocoded.longitude } });
          location = geocoded;
        }
      }
      return location;
    }
    const fromBrasilApi = await this.fromBrasilApi(cep);
    let location = fromBrasilApi ?? await this.fromViaCep(cep);
    if (location === null) throw new AppError({ code: 'DIRECTORY_CEP_NOT_FOUND', message: 'Não encontramos esse CEP. Confira os números e tente novamente.', statusCode: 404 });
    if (location.latitude === null || location.longitude === null) {
      const geocoded = await this.geoapifyGeocode(location);
      if (geocoded !== null) {
        location = geocoded;
      }
    }
    const saved = await this.client.directoryPostalCodeCache.upsert({ where: { cep }, update: { ...location, provider: fromBrasilApi === null ? 'VIACEP' : 'BRASILAPI' }, create: { ...location, cep, provider: fromBrasilApi === null ? 'VIACEP' : 'BRASILAPI' } });
    return this.toLocation(saved);
  }

  private toLocation(row: any): Location {
    return {
      cep: row.cep,
      city: row.city,
      state: row.state,
      neighborhood: row.neighborhood,
      street: row.street,
      latitude: row.latitude,
      longitude: row.longitude,
    };
  }

  private async fromBrasilApi(cep: string): Promise<Location | null> {
    try { const response = await timeoutFetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, 4_000); if (!response.ok) return null; const data = await response.json() as Record<string, unknown>; const coordinates = data.location !== null && typeof data.location === 'object' ? (data.location as { coordinates?: Record<string, unknown> }).coordinates : undefined; const city = text(data.city); const state = text(data.state); return city === null || state === null ? null : { cep, city, state, neighborhood: text(data.neighborhood), street: text(data.street), latitude: number(coordinates?.latitude), longitude: number(coordinates?.longitude) }; } catch { return null; }
  }

  private async fromViaCep(cep: string): Promise<Location | null> {
    try { const response = await timeoutFetch(`https://viacep.com.br/ws/${cep}/json/`, 4_000); if (!response.ok) return null; const data = await response.json() as Record<string, unknown>; if (data.erro === true) return null; const city = text(data.localidade); const state = text(data.uf); return city === null || state === null ? null : { cep, city, state, neighborhood: text(data.bairro), street: text(data.logradouro), latitude: null, longitude: null }; } catch { return null; }
  }

  private async resolveCepWithDiagnostics(cep: string, metrics: DirectoryGeocodeMetrics): Promise<Location> {
    const cached = await this.client.directoryPostalCodeCache.findUnique({ where: { cep } });
    if (cached !== null && cached.updatedAt > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)) {
      let location = this.toLocation(cached);
      metrics.attempted = true;
      metrics.source = 'CACHE';
      metrics.success = location.latitude !== null && location.longitude !== null;
      if (location.latitude === null || location.longitude === null) {
        const geocoded = await this.geoapifyGeocodeWithDiagnostics(location, metrics);
        if (geocoded !== null) {
          await this.client.directoryPostalCodeCache.update({ where: { cep }, data: { latitude: geocoded.latitude, longitude: geocoded.longitude } });
          location = geocoded;
          metrics.success = true;
        }
      }
      return location;
    }
    const fromBrasilApi = await this.fromBrasilApi(cep);
    let location = fromBrasilApi ?? await this.fromViaCep(cep);
    if (location === null) throw new AppError({ code: 'DIRECTORY_CEP_NOT_FOUND', message: 'Não encontramos esse CEP. Confira os números e tente novamente.', statusCode: 404 });
    metrics.attempted = true;
    metrics.source = fromBrasilApi === null ? 'VIACEP' : 'BRASILAPI';
    if (location.latitude === null || location.longitude === null) {
      const geocoded = await this.geoapifyGeocodeWithDiagnostics(location, metrics);
      if (geocoded !== null) {
        location = geocoded;
        metrics.success = true;
      }
    } else {
      metrics.success = true;
    }
    const saved = await this.client.directoryPostalCodeCache.upsert({ where: { cep }, update: { ...location, provider: fromBrasilApi === null ? 'VIACEP' : 'BRASILAPI' }, create: { ...location, cep, provider: fromBrasilApi === null ? 'VIACEP' : 'BRASILAPI' } });
    return this.toLocation(saved);
  }

  private async geoapifyGeocodeWithDiagnostics(location: Location, parentMetrics: DirectoryGeocodeMetrics): Promise<Location | null> {
    const startedAt = Date.now();
    try {
      const geoapifyApiKey = this.options.geoapifyApiKeyProvider ? await this.options.geoapifyApiKeyProvider() : undefined;
      parentMetrics.apiKeyAvailable = geoapifyApiKey !== undefined;
      if (!geoapifyApiKey) {
        parentMetrics.errorType = 'NO_API_KEY';
        return null;
      }
      const parts = [location.cep.slice(0, 5) + '-' + location.cep.slice(5)];
      if (location.street) parts.push(location.street);
      if (location.neighborhood) parts.push(location.neighborhood);
      parts.push(location.city, location.state, 'Brasil');
      const query = parts.join(', ');
      const url = new URL('https://api.geoapify.com/v1/geocode/search');
      url.searchParams.set('text', query);
      url.searchParams.set('apiKey', geoapifyApiKey);
      parentMetrics.requestAttempted = true;
      parentMetrics.requestUrlHost = 'api.geoapify.com';
      const response = await timeoutFetch(url.toString(), 4_000);
      parentMetrics.durationMs = Date.now() - startedAt;
      parentMetrics.httpStatus = response.status;
      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
          if (errorBody.length > 500) errorBody = errorBody.slice(0, 500) + '...';
        } catch {}
        parentMetrics.errorType = 'HTTP_ERROR';
        parentMetrics.errorMessage = `HTTP ${response.status}: ${errorBody}`;
        return null;
      }
      const data = await response.json() as { features?: GeoFeature[] };
      parentMetrics.featuresReceived = (data.features ?? []).length;
      const feature = data.features?.[0];
      if (!feature) {
        parentMetrics.errorType = 'NO_FEATURES';
        parentMetrics.errorMessage = 'Geoapify retornou 200 mas sem features';
        return null;
      }
      const coordinates = Array.isArray(feature.geometry?.coordinates) ? feature.geometry!.coordinates : [];
      const latitude = number(coordinates[1]);
      const longitude = number(coordinates[0]);
      if (latitude === null || longitude === null) {
        parentMetrics.errorType = 'INVALID_COORDINATES';
        parentMetrics.errorMessage = `Coordenadas inválidas: [${coordinates[0]}, ${coordinates[1]}]`;
        return null;
      }
      parentMetrics.source = 'GEOAPIFY';
      parentMetrics.durationMs = Date.now() - startedAt;
      return { ...location, latitude, longitude };
    } catch (error) {
      parentMetrics.durationMs = Date.now() - startedAt;
      if (error instanceof Error) {
        parentMetrics.errorType = error.name;
        parentMetrics.errorMessage = error.message;
        if ((error as any).cause?.code) {
          parentMetrics.errorCode = String((error as any).cause.code);
        }
      } else {
        parentMetrics.errorType = 'UNKNOWN_ERROR';
        parentMetrics.errorMessage = String(error);
      }
      return null;
    }
  }

  private async geoapify(categoryId: bigint, categoriesValue: Prisma.JsonValue | null, termsValue: Prisma.JsonValue | null, location: Location): Promise<DirectorySearchResult[]> {
    const categories = jsonStrings(categoriesValue);
    const terms = jsonStrings(termsValue).map(norm);
    const geoapifyApiKey = this.options.geoapifyApiKeyProvider ? await this.options.geoapifyApiKeyProvider() : undefined;
    if (geoapifyApiKey === undefined || location.latitude === null || location.longitude === null || categories.length === 0) return [];
    for (const radius of [5_000, 10_000]) {
      const cached = await this.externalCache(categoryId, location.cep, radius);
      if (cached !== null) {
        if (cached.length > 0 || radius === 10_000) return cached;
        continue;
      }
      const url = new URL('https://api.geoapify.com/v2/places');
      url.searchParams.set('categories', categories.join(','));
      url.searchParams.set('filter', `circle:${location.longitude},${location.latitude},${radius}`);
      url.searchParams.set('bias', `proximity:${location.longitude},${location.latitude}`);
      url.searchParams.set('limit', '20');
      url.searchParams.set('apiKey', geoapifyApiKey);
      try {
        const response = await timeoutFetch(url.toString(), 5_000);
        if (!response.ok) return [];
        const data = await response.json() as { features?: GeoFeature[] };
        const results = (data.features ?? [])
          .map((feature) => this.geoResult(feature, location))
          .filter((item): item is DirectorySearchResult => item !== null)
          .filter((item) => terms.length === 0 || terms.some((term) => norm(item.name).includes(term)));
        await this.saveExternalCache(categoryId, location.cep, radius, results);
        if (results.length > 0 || radius === 10_000) return results;
      } catch {
        return [];
      }
    }
    return [];
  }

  private async geoapifyGeocode(location: Location): Promise<Location | null> {
    const geoapifyApiKey = this.options.geoapifyApiKeyProvider ? await this.options.geoapifyApiKeyProvider() : undefined;
    if (geoapifyApiKey === undefined) return null;
    try {
      const parts = [location.cep.slice(0, 5) + '-' + location.cep.slice(5)];
      if (location.street) parts.push(location.street);
      if (location.neighborhood) parts.push(location.neighborhood);
      parts.push(location.city, location.state, 'Brasil');
      const query = parts.join(', ');
      const url = new URL('https://api.geoapify.com/v1/geocode/search');
      url.searchParams.set('text', query);
      url.searchParams.set('apiKey', geoapifyApiKey);
      const response = await timeoutFetch(url.toString(), 4_000);
      if (!response.ok) return null;
      const data = await response.json() as { features?: GeoFeature[] };
      const feature = data.features?.[0];
      if (!feature) return null;
      const coordinates = Array.isArray(feature.geometry?.coordinates) ? feature.geometry!.coordinates : [];
      const latitude = number(coordinates[1]);
      const longitude = number(coordinates[0]);
      if (latitude === null || longitude === null) return null;
      return { ...location, latitude, longitude };
    } catch {
      return null;
    }
  }

  private async geoapifyWithDiagnostics(categoryId: bigint, categoriesValue: Prisma.JsonValue | null, termsValue: Prisma.JsonValue | null, location: Location, metrics: DirectoryPlacesMetrics): Promise<DirectorySearchResult[]> {
    const categories = jsonStrings(categoriesValue);
    const terms = jsonStrings(termsValue).map(norm);
    const geoapifyApiKey = this.options.geoapifyApiKeyProvider ? await this.options.geoapifyApiKeyProvider() : undefined;
    if (geoapifyApiKey === undefined || location.latitude === null || location.longitude === null || categories.length === 0) return [];
    metrics.attempted = true;
    for (const radius of [5_000, 10_000]) {
      const cached = await this.externalCache(categoryId, location.cep, radius);
      if (cached !== null) {
        if (cached.length > 0 || radius === 10_000) {
          metrics.featuresReceived = cached.length;
          metrics.acceptedResults = cached.length;
          return cached;
        }
        continue;
      }
      const url = new URL('https://api.geoapify.com/v2/places');
      url.searchParams.set('categories', categories.join(','));
      url.searchParams.set('filter', `circle:${location.longitude},${location.latitude},${radius}`);
      url.searchParams.set('bias', `proximity:${location.longitude},${location.latitude}`);
      url.searchParams.set('limit', '20');
      url.searchParams.set('apiKey', geoapifyApiKey);
      try {
        const response = await timeoutFetch(url.toString(), 5_000);
        metrics.httpStatus = response.status;
        if (!response.ok) return [];
        const data = await response.json() as { features?: GeoFeature[] };
        const features = data.features ?? [];
        metrics.featuresReceived = features.length;
        const results = features
          .map((feature) => this.geoResult(feature, location))
          .filter((item): item is DirectorySearchResult => item !== null)
          .filter((item) => terms.length === 0 || terms.some((term) => norm(item.name).includes(term)));
        metrics.acceptedResults = results.length;
        await this.saveExternalCache(categoryId, location.cep, radius, results);
        if (results.length > 0 || radius === 10_000) return results;
      } catch {
        return [];
      }
    }
    return [];
  }

  private geoResult(feature: GeoFeature, location: Location): DirectorySearchResult | null { const props = feature.properties ?? {}; const coordinates = Array.isArray(feature.geometry?.coordinates) ? feature.geometry!.coordinates : []; const longitude = number(coordinates[0]); const latitude = number(coordinates[1]); const name = text(props.name); if (name === null) return null; const phone = text(props.contact_phone) ?? text(props.phone); return { source: 'GEOAPIFY', publicId: null, name, address: text(props.formatted) ?? [text(props.address_line1), text(props.address_line2)].filter((value): value is string => value !== null).join(', '), city: text(props.city) ?? location.city, state: text(props.state_code)?.toUpperCase() ?? location.state, neighborhood: text(props.suburb), phone, whatsapp: null, website: text(props.website), latitude, longitude, distanceMeters: number(props.distance) }; }
  private cacheKey(categoryId: bigint, cep: string, radius: number) { return createHash('sha256').update(`${categoryId}:${cep}:${radius}`).digest('hex'); }
  private async externalCache(categoryId: bigint, cep: string, radius: number): Promise<DirectorySearchResult[] | null> { const found = await this.client.directoryExternalSearchCache.findUnique({ where: { cacheKey: this.cacheKey(categoryId, cep, radius) } }); return found === null || found.updatedAt < new Date(Date.now() - 24 * 60 * 60 * 1000) ? null : found.results as unknown as DirectorySearchResult[]; }
  private async saveExternalCache(categoryId: bigint, cep: string, radius: number, results: DirectorySearchResult[]) { const cacheKey = this.cacheKey(categoryId, cep, radius); await this.client.directoryExternalSearchCache.upsert({ where: { cacheKey }, update: { results: results as unknown as Prisma.InputJsonValue }, create: { cacheKey, categoryId, cep, radius, results: results as unknown as Prisma.InputJsonValue } }); }
  private dedupe(results: DirectorySearchResult[]) { const seen = new Set<string>(); return results.filter((item) => { const key = item.phone !== null ? `phone:${item.phone.replace(/\D/gu, '')}` : `name:${norm(item.name)}:${norm(item.address || item.city)}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
  private slug(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/(^-|-$)/gu, ''); }
}
