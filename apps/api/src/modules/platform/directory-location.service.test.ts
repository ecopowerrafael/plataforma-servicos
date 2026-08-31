import { afterEach, describe, expect, it, vi } from 'vitest';

import { DirectoryLocationService } from './directory-location.service.js';
import { type PrismaClient } from '../../database-client/client.js';

const location = { cep: '18150000', city: 'Ibiúna', state: 'SP', neighborhood: null, street: null, latitude: -23.65, longitude: -47.22, provider: 'BRASILAPI', updatedAt: new Date() };
const category = { id: 1n, slug: 'barbearias', active: true, geoapifyCategories: ['service.beauty.hairdresser'], externalSearchTerms: ['barber'] };
const business = (index: number) => ({ publicId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, name: `Barbearia ${index}`, rawAddress: `Rua ${index}`, city: 'Ibiúna', state: 'SP', neighborhood: null, phone: null, whatsapp: null, websiteUrl: null, relevanceScore: 10 - index });

function client(input: { cached?: typeof location | null; businesses?: ReturnType<typeof business>[]; cachedExternal?: unknown }) {
  return {
    directoryPostalCodeCache: { findUnique: vi.fn().mockResolvedValue(input.cached ?? null), upsert: vi.fn().mockResolvedValue(location) },
    directoryCategory: { findFirst: vi.fn().mockResolvedValue(category) },
    directoryBusiness: { findMany: vi.fn().mockResolvedValue(input.businesses ?? []) },
    directoryExternalSearchCache: { findUnique: vi.fn().mockResolvedValue(input.cachedExternal ?? null), upsert: vi.fn().mockResolvedValue({}) },
  } as unknown as PrismaClient;
}

afterEach(() => vi.unstubAllGlobals());

describe('Directory CEP search', () => {
  it('uses the cached CEP and does not call BrasilAPI or Geoapify when local results meet the minimum', async () => {
    const database = client({ cached: location, businesses: Array.from({ length: 10 }, (_, index) => business(index)) });
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const result = await new DirectoryLocationService(database, { geoapifyApiKeyProvider: async () => 'key', localMinResults: 5 }).search('barbearias', '18150-000');
    expect(result.results).toHaveLength(10);
    expect(result.results.every((item) => item.source === 'DIRECTORY')).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('resolves and stores a new CEP before searching local businesses', async () => {
    const database = client({ businesses: Array.from({ length: 5 }, (_, index) => business(index)) });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ cep: '18150-000', city: 'Ibiúna', state: 'SP', neighborhood: 'Centro', street: 'Rua Central', location: { coordinates: { latitude: -23.65, longitude: -47.22 } } }) }));
    await new DirectoryLocationService(database).search('barbearias', '18150000');
    expect(database.directoryPostalCodeCache.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { cep: '18150000' } }));
  });

  it('uses Geoapify only to complement a short local list and deduplicates it', async () => {
    const database = client({ cached: location, businesses: [business(1), business(2)] });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [{ properties: { name: 'Barbearia 1', formatted: 'Rua 1', city: 'Ibiúna', state_code: 'sp' }, geometry: { coordinates: [-47.22, -23.65] } }, { properties: { name: 'Barber Externa', formatted: 'Rua Nova', city: 'Ibiúna', state_code: 'sp', contact_phone: '11999999999' }, geometry: { coordinates: [-47.21, -23.64] } }] }) }));
    const result = await new DirectoryLocationService(database, { geoapifyApiKeyProvider: async () => 'key' }).search('barbearias', '18150000');
    expect(result.results.filter((item) => item.name === 'Barbearia 1')).toHaveLength(1);
    expect(result.results.some((item) => item.source === 'GEOAPIFY')).toBe(true);
  });

  it('returns local results only when Geoapify is not configured', async () => {
    const database = client({ cached: location, businesses: [business(1), business(2)] });
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const result = await new DirectoryLocationService(database).search('barbearias', '18150000');
    expect(result.results).toHaveLength(2);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
