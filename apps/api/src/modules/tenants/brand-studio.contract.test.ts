import { readFileSync } from 'node:fs';

import { TenantBrandingSchema } from '@plataforma/shared';
import { describe, expect, it } from 'vitest';

const readWeb = (path: string) =>
  readFileSync(new URL(`../../../../web/src/${path}`, import.meta.url), 'utf8');

const studio = readWeb('components/tenants/WhiteLabelModule.tsx');
const palette = readWeb('components/branding/BrandColorPalette.tsx');
const assetCard = readWeb('components/branding/BrandAssetCard.tsx');
const livePreview = readWeb('components/branding/BrandLivePreview.tsx');
const themes = readWeb('components/branding/brand-studio.ts');
const layouts = readWeb('components/branding/PublicLayoutPicker.tsx');
const publicPage = readWeb('routes/PublicTenantPage.tsx');

const PALETTE_KEYS = [
  'primaryColor',
  'secondaryColor',
  'accentColor',
  'backgroundColor',
  'surfaceColor',
  'textColor',
  'mutedTextColor',
  'borderColor',
] as const;

describe('cores', () => {
  it('só expõe tokens que existem no branding persistido', () => {
    const branding = TenantBrandingSchema.keyof().options;
    const fields = [...palette.matchAll(/key: '([a-zA-Z]+)'/gu)].map((match) => match[1]);

    expect(fields).toEqual([...PALETTE_KEYS]);
    for (const field of fields) expect(branding).toContain(field);
  });

  it('envia a paleta inteira no PATCH de branding', () => {
    expect(studio).toContain("body: { ...palette, useProfileDefaults: false }");
    for (const key of PALETTE_KEYS) expect(studio).toContain(key);
  });

  it('oferece presets e restauração das cores do tema', () => {
    expect(palette).toContain('Restaurar cores do tema');
    expect(studio).toContain('onRestoreTheme');
    expect(studio).toContain('onApplyPreset');
    expect(studio).toContain('deriveBrandPalette(palette.primaryColor, theme)');
  });

  it('trocar o tema carrega os defaults dele', () => {
    expect(studio).toContain('setPaletteOverride(deriveBrandPalette(palette.primaryColor, value))');
  });

  it('avisa sobre contraste sem alterar a cor escolhida', () => {
    expect(palette).toContain('Sua escolha foi mantida');
    expect(palette).not.toContain('onChange(field.key, contrast');
  });
});

describe('prévia real', () => {
  it('usa iframe da rota pública real, sem preview artificial', () => {
    expect(livePreview).toContain('`/public/${slug}?preview=1&v=${String(version)}`');
    expect(livePreview).toContain('<iframe');
    expect(studio).not.toContain('BrandPreview');
  });

  it('alterna celular/desktop e abre a página pública', () => {
    expect(livePreview).toContain("onModeChange('mobile')");
    expect(livePreview).toContain("onModeChange('desktop')");
    expect(livePreview).toContain('Abrir página pública');
  });

  it('recarrega depois de salvar', () => {
    expect(studio).toContain('setPreviewVersion((version) => version + 1)');
  });

  it('a página pública não mostra splash dentro do preview', () => {
    expect(publicPage).toContain("get('preview') !== '1'");
  });
});

describe('modelos e temas', () => {
  it('mantém Classic e Premium com mock estrutural', () => {
    expect(layouts).toContain('layout-header');
    expect(layouts).toContain('layout-nav');
    expect(studio).toContain('PublicLayoutPicker');
  });

  it('mantém os quatro temas e o texto correto', () => {
    const codes = [...themes.matchAll(/code: '([A-Z_]+)'/gu)].map((match) => match[1]);
    expect(codes.slice(0, 4)).toEqual(['CLASSIC', 'PREMIUM', 'MODERN', 'LUXURY']);
    expect(studio).toContain('Quatro estilos visuais');
    expect(studio).not.toContain('Três direções');
  });
});

describe('imagens da marca', () => {
  it('usa cartão compacto com alterar/remover e dropzone quando vazio', () => {
    expect(assetCard).toContain("{previewUrl === undefined ? 'Enviar' : 'Alterar'}");
    expect(assetCard).toContain('Remover');
    expect(assetCard).toContain('brand-asset-dropzone');
  });

  it('preserva as validações de upload', () => {
    expect(assetCard).toContain('ACCEPTED_TYPES');
    expect(assetCard).toContain('MAX_BYTES');
    expect(assetCard).toContain('O ícone do aplicativo precisa ser uma imagem quadrada.');
  });

  it('mantém logo, splash e ícone com os mesmos endpoints', () => {
    for (const kind of ['LOGO', 'SPLASH', 'APP_ICON']) expect(studio).toContain(`kind: '${kind}'`);
    expect(studio).toContain('/tenant/media/${kind}');
    expect(studio).toContain('Usar meu logo automaticamente');
  });

  it('não duplica a imagem em previews extras', () => {
    expect(studio).not.toContain('brand-device-preview');
    expect(studio).not.toContain('brand-home-screen-preview');
  });
});
