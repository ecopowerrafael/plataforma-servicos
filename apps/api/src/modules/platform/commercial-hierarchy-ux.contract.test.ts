import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const routes = read('./platform.commercial-routes.ts');
const managers = read('../../../../web/src/components/platform/CommercialManagersTab.tsx');
const regions = read('../../../../web/src/components/platform/CommercialRegionsTab.tsx');
const clients = read('../../../../web/src/components/platform/PlatformCommercialClientsTab.tsx');

describe('gestão da hierarquia comercial — contrato UX', () => {
  it('lista regiões e métricas de gerente por rotas existentes', () => {
    expect(routes).toContain("'/platform/commercial/regions'");
    expect(routes).toContain('regionsCount');
    expect(routes).toContain('clientsCount');
    expect(routes).toContain('representativesCount');
  });

  it('mantém edição de gerente e detalhe de equipe na página', () => {
    expect(managers).toContain("method: 'PATCH'");
    expect(managers).toContain('Ver equipe');
    expect(managers).toContain('Editar gerente');
  });

  it('usa cidades canônicas e formulários inline para regiões e clientes', () => {
    expect(regions).toContain('/platform/locations/cities?state=');
    expect(regions).toContain('Salvar Região');
    expect(clients).toContain('editing!==undefined&&<section className="form-card">');
    expect(clients).not.toContain('modal-overlay');
    expect(clients).toContain('Reatribuir Cliente');
  });
});
