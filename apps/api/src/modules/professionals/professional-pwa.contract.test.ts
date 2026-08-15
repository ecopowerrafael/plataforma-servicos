import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { TenantWhiteLabelService } from '../tenants/tenant-white-label.service.js';
const service = readFileSync(new URL('../tenants/tenant-white-label.service.ts', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../tenants/tenant-white-label.routes.ts', import.meta.url), 'utf8');
const professional = readFileSync(new URL('../../../../web/src/routes/ProfessionalAppPage.tsx', import.meta.url), 'utf8');
const login = readFileSync(new URL('../../../../web/src/routes/LoginPage.tsx', import.meta.url), 'utf8');
const home = readFileSync(new URL('../../../../web/src/routes/HomePage.tsx', import.meta.url), 'utf8');

describe('manifest do Professional App', () => {
  it('tem identidade estável por tenant/profissional e mantém o escopo profissional', () => {
    expect(service).toContain('`/pwa/professional/${tenant.publicId}/${professional.publicId}`');
    expect(service).toContain('scope: `/public/${tenant.slug}/profissional`');
    expect(service).toContain('start_url: `/public/${tenant.slug}/profissional`');
    expect(professional).toContain('/public/professionals/${tenantPublicId}/${professionalId}/manifest.webmanifest');
  });

  it('gera somente metadados PWA para o profissional pertencente ao tenant e retorna 404 para outro', async () => {
    const tenantPublicId = '11111111-1111-4111-8111-111111111111';
    const professionalPublicId = '22222222-2222-4222-8222-222222222222';
    const tenant = {
      id: 1n, publicId: tenantPublicId, slug: 'barbearia', displayName: 'Barbearia',
      businessProfile: 'BARBERSHOP' as const, branding: null, terminology: null, publicSite: null,
      mediaAssets: [], services: [], professionals: [], businessUnits: [],
    };
    const professionalFind = vi.fn().mockResolvedValue({ publicId: professionalPublicId });
    const repository = {
      findTenantByPublicId: vi.fn().mockResolvedValue(tenant),
      findPublicTenant: vi.fn().mockResolvedValue(tenant),
      listAssets: vi.fn().mockResolvedValue([]),
      findPwaState: vi.fn().mockResolvedValue({ status: 'DRAFT', publishedAt: null }),
    };
    const serviceUnderTest = new TenantWhiteLabelService(
      repository as never, {} as never, {} as never, {} as never, undefined,
      { professional: { findFirst: professionalFind } } as never,
    );
    const manifest = await serviceUnderTest.professionalManifest(tenantPublicId, professionalPublicId);
    expect(manifest).toMatchObject({
      id: `/pwa/professional/${tenantPublicId}/${professionalPublicId}`,
      scope: '/public/barbearia/profissional', start_url: '/public/barbearia/profissional',
      icons: [{ src: '/icons/agendei-192.png', sizes: '192x192' }, { src: '/icons/agendei-512.png', sizes: '512x512' }],
    });
    expect(Object.keys(manifest)).not.toEqual(expect.arrayContaining(['email', 'phone', 'userId', 'token']));
    professionalFind.mockResolvedValueOnce(null);
    await expect(serviceUnderTest.professionalManifest(tenantPublicId, professionalPublicId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('valida a pertença ativa e não adiciona dados privados na resposta pública', () => {
    expect(service).toContain('where: { tenantId: tenant.id, publicId: professionalPublicId, active: true }');
    expect(service).toContain('select: { publicId: true }');
    expect(routes).toContain('/public/professionals/:tenantPublicId/:professionalPublicId/manifest.webmanifest');
    expect(service).toContain("src: '/icons/agendei-192.png'");
    expect(service).toContain("src: '/icons/agendei-512.png'");
    expect(service).not.toContain('professional.email');
    expect(service).not.toContain('professional.phone');
    expect(service).not.toContain('professional.userId');
  });

  it('redireciona profissional para o app próprio e mantém o acesso negado em estado seguro', () => {
    expect(login).toContain("availableTenant.membership.roleCode === 'PROFESSIONAL'");
    expect(login).toContain(': `/app${continuation}`');
    expect(home).toContain("membership.roleCode === 'PROFESSIONAL'");
    expect(professional).toContain("permissions.includes('professional.self.read') !== true");
    expect(professional).toContain('`/public/${slug}/profissional/login`');
  });
});
