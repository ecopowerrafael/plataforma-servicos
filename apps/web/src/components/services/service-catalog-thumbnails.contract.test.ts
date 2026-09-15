import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const moduleSource = readFileSync(new URL('./ServiceModule.tsx', import.meta.url), 'utf8');
const rowSource = readFileSync(new URL('./ServiceUIComponents.tsx', import.meta.url), 'utf8');
const imageSource = readFileSync(new URL('./TenantServiceImage.tsx', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('../../styles/catalog.css', import.meta.url), 'utf8');
const apiServiceSource = readFileSync(
  new URL('../../../../../apps/api/src/modules/services/service.service.ts', import.meta.url),
  'utf8',
);
const sharedServiceSource = readFileSync(
  new URL('../../../../../packages/shared/src/service.ts', import.meta.url),
  'utf8',
);

describe('service catalog thumbnails contract', () => {
  it('uses existing service image payload fields from /tenant/services', () => {
    expect(sharedServiceSource).toContain('publicId: z.uuid()');
    expect(sharedServiceSource).toContain('imageAlt: z.string().nullable()');
    expect(sharedServiceSource).toContain('imageUrl: ImageUrlSchema');
    expect(apiServiceSource).toContain('publicId: service.publicId');
    expect(apiServiceSource).toContain('imageAlt: service.imageAlt');
    expect(apiServiceSource).toContain("imageUrl: service.imagePath === null ? null : `/tenant/services/${service.publicId}/image`");
  });

  it('renders real thumbnails with TenantServiceImage when imageUrl exists', () => {
    expect(moduleSource).toContain('import { TenantServiceImage }');
    expect(moduleSource).toContain('thumbnail={');
    expect(moduleSource).toContain('service.imageUrl === null ? undefined');
    expect(moduleSource).toContain('<TenantServiceImage');
    expect(moduleSource).toContain('servicePublicId={service.publicId}');
    expect(moduleSource).toContain('tenantPublicId={tenantPublicId}');
    expect(imageSource).toContain('/tenant/${kind}/${servicePublicId}/image?variant=thumbnail');
  });

  it('uses imageAlt as alt and falls back to the service name', () => {
    expect(moduleSource).toContain('alt={service.imageAlt ?? service.name}');
  });

  it('renders a visual fallback when there is no image', () => {
    expect(rowSource).toContain('fallbackInitial');
    expect(rowSource).toContain('service-row-thumbnail-fallback');
    expect(stylesSource).toContain('.service-row-thumbnail');
    expect(stylesSource).toContain('height: 48px;');
    expect(stylesSource).toContain('width: 48px;');
    expect(stylesSource).toContain('object-fit: cover;');
  });

  it('keeps duration, price and row click behavior visible', () => {
    expect(moduleSource).toContain('duration={`${service.durationMinutes} min`}');
    expect(moduleSource).toContain('price={money(service.priceCents)}');
    expect(rowSource).toContain('className="service-row-info"');
    expect(rowSource).toContain('className="service-row-price"');
    expect(rowSource).toContain('onClick={onClick}');
    expect(stylesSource).toContain('white-space: nowrap;');
    expect(stylesSource).toContain('justify-self: start;');
  });

  it('keeps service rows compact on desktop and visible on mobile', () => {
    expect(stylesSource).toContain('grid-template-columns: 52px minmax(0, 1fr) auto auto;');
    expect(stylesSource).toContain('min-height: 68px;');
    expect(stylesSource).toContain('padding: 8px 16px;');
    expect(stylesSource).toContain('grid-template-columns: 48px minmax(0, 1fr);');
    expect(stylesSource).not.toContain('.service-row,\n  .professional-row {\n    display: none;');
  });
});
