import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DirectoryBadge, DirectoryPagination, DirectoryTabs } from './DirectoryWorkspace.js';

describe('Directory workspace navigation', () => {
  it('renders all eight sections and identifies the active tab accessibly', () => {
    const html = renderToStaticMarkup(
      <DirectoryTabs active="businesses" onChange={() => undefined} />,
    );
    expect(html).toContain('Visão geral');
    expect(html).toContain('Estabelecimentos');
    expect(html).toContain('Categorias');
    expect(html).toContain('Importações');
    expect(html).toContain('SEO');
    expect(html).toContain('Métricas');
    expect(html).toContain('Geolocalização');
    expect(html).toContain('Configurações');
    expect(html).toContain('aria-selected="true"');
  });

  it('renders compact status and pagination contracts', () => {
    const html = renderToStaticMarkup(
      <>
        <DirectoryBadge tone="success">Operacional</DirectoryBadge>
        <DirectoryPagination page={2} total={42} totalPages={3} onPage={() => undefined} />
      </>,
    );
    expect(html).toContain('directory-badge--success');
    expect(html).toContain('42 registros');
    expect(html).toContain('2 / 3');
  });
});
