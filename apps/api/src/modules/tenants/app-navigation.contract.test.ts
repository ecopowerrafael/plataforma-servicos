import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const routerSource = readFileSync(new URL('../../../../web/src/router.tsx', import.meta.url), 'utf8');
const homeSource = readFileSync(new URL('../../../../web/src/routes/HomePage.tsx', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('../../../../web/src/styles.css', import.meta.url), 'utf8');

describe('app navigation architecture', () => {
  it('registers independent submenu routes', () => {
    for (const route of [
      '/app/agenda/agendamentos',
      '/app/agenda/disponibilidade',
      '/app/agenda/lista-espera',
      '/app/servicos/categorias',
      '/app/equipe/membros',
      '/app/financeiro/relatorios',
      '/app/empresa/marca',
      '/app/configuracoes/sessoes',
    ]) expect(routerSource).toContain(`path: '${route}'`);
  });

  it('keeps the desktop sidebar fixed with its own scroll', () => {
    expect(stylesSource).toMatch(/\.app-navigation\s*\{[^}]*position:fixed/);
    expect(stylesSource).toMatch(/\.app-navigation\s*\{[^}]*height:calc\(100vh - 2rem\)/);
    expect(stylesSource).toMatch(/\.app-navigation\s*\{[^}]*overflow-y:auto/);
  });

  it('keeps the mobile app bar and grouped drawer', () => {
    expect(homeSource).toContain('className="app-mobile-nav"');
    expect(homeSource).toContain('className="mobile-sheet mobile-menu-sheet"');
    expect(homeSource).toContain('menuGroups.map');
  });

  it('applies permission and plan gates to navigation entries', () => {
    expect(homeSource).toContain("canReadProducts && planFeatureEnabled('products.enabled')");
    expect(homeSource).toContain("canViewWaitlist && planFeatureEnabled('waitlist.enabled')");
    expect(homeSource).toContain("canManageBranding && planFeatureEnabled('branding.customization.enabled')");
  });
});
