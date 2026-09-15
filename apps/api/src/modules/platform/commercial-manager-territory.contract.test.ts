import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const managerForm = read('../../../../web/src/components/platform/CommercialManagersTab.tsx');
const platformRoutes = read('./platform.routes.ts');

describe('território de gerente — cidades canônicas', () => {
  it('expõe municípios oficiais por estado, pesquisa e código IBGE', () => {
    expect(platformRoutes).toContain("'/platform/locations/cities'");
    expect(platformRoutes).toContain('servicodados.ibge.gov.br');
    expect(platformRoutes).toContain('ibgeCode: String(municipality.id)');
    expect(platformRoutes).toContain('municipalitiesByState');
  });

  it('exige selecionar estado e uma cidade da lista, sem salvar texto livre', () => {
    expect(managerForm).toContain('<select');
    expect(managerForm).toContain('disabled={!formData.regionState}');
    expect(managerForm).toContain("citySearch.trim().length >= 2");
    expect(managerForm).toContain('Selecione ao menos uma cidade para o território.');
    expect(managerForm).toContain('Texto digitado não é salvo como território.');
  });

  it('limpa território ao trocar o estado e impede cidades repetidas', () => {
    expect(managerForm).toContain('regionState: e.target.value, regionCities: []');
    expect(managerForm).toContain('selected.ibgeCode === city.ibgeCode');
    expect(managerForm).toContain('cities: formData.regionCities');
  });
});
