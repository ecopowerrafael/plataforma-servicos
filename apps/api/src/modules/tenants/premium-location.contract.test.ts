import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..', '..', '..', '..', 'web', 'src');

describe('premium banner and location contracts', () => {
  it('renders a pure responsive banner only in Premium', async () => {
    const component = await readFile(
      join(root, 'components', 'public', 'premium', 'PremiumApp.tsx'),
      'utf8',
    );
    const css = await readFile(join(root, 'public-premium.css'), 'utf8');
    const hero = /<section className="premium-hero"[^>]*\/>/u.exec(component)?.[0] ?? '';
    expect(hero).not.toContain('heroTitle');
    expect(hero).not.toContain('heroSubtitle');
    expect(hero).not.toContain('primaryCallToAction');
    expect(/\.premium-app \.premium-hero \{[\s\S]*?\}/u.exec(css)?.[0]).not.toContain('gradient');
    expect(css).toContain('var(--tenant-banner-mobile');
    expect(css).toContain('var(--tenant-banner-desktop');
    expect(css).toContain('background-size: cover');
  });

  it('keeps Classic rendering its headline and CTA', async () => {
    const page = await readFile(join(root, 'routes', 'PublicTenantPage.tsx'), 'utf8');
    expect(page).toContain('site.data.site.heroTitle');
    expect(page).toContain('site.data.site.primaryCallToAction');
  });
});
