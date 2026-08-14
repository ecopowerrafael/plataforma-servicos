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
const pwaModule = readWeb('components/tenants/TenantPwaModule.tsx');
const previewHook = readWeb('components/public/use-preview-override.ts');

const PALETTE_KEYS = [
  'primaryColor',
  'secondaryColor',
  'accentColor',
  'backgroundColor',
  'surfaceColor',
  'textColor',
  'mutedTextColor',
  'borderColor',
  'onPrimaryColor',
  'headerColor',
  'headerTextColor',
  'navigationColor',
  'activeColor',
] as const;

const SEMANTIC_KEYS = [
  'onPrimaryColor',
  'headerColor',
  'headerTextColor',
  'navigationColor',
  'activeColor',
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

describe('tokens semânticos', () => {
  it('os cinco novos tokens existem no branding e na tela', () => {
    const branding = TenantBrandingSchema.keyof().options;
    for (const key of SEMANTIC_KEYS) {
      expect(branding).toContain(key);
      expect(palette).toContain(`key: '${key}'`);
    }
  });

  it('a página pública usa variáveis semânticas com fallback derivado', () => {
    expect(publicPage).toContain("'--tenant-header': branding.headerColor ?? branding.backgroundColor");
    expect(publicPage).toContain(
      "'--tenant-header-text': branding.headerTextColor ?? branding.textColor",
    );
    expect(publicPage).toContain(
      "'--tenant-navigation': branding.navigationColor ?? branding.surfaceColor",
    );
    expect(publicPage).toContain("'--tenant-active': branding.activeColor ?? branding.primaryColor");
    expect(publicPage).toContain('branding.onPrimaryColor ?? contrastTextColor(branding.primaryColor)');
  });

  it('o CSS público lê os tokens sem HEX solto', () => {
    const premium = readWeb('public-premium.css');
    expect(premium).toContain('var(--tenant-header, var(--tenant-background))');
    expect(premium).toContain('var(--tenant-navigation,');
    expect(premium).toContain('var(--tenant-active, var(--tenant-primary))');
  });

  it('restaurar tema devolve também os tokens semânticos', () => {
    const themeFile = readWeb('components/branding/brand-studio.ts');
    for (const key of SEMANTIC_KEYS) expect(themeFile).toContain(`${key}:`);
    expect(studio).toContain('deriveBrandPalette(palette.primaryColor, theme)');
  });

  it('tenant legado com tokens null cai no derivado do tema', () => {
    expect(studio).toContain('branding[key] ?? derived[key]');
  });
});

describe('prévia sem salvar', () => {
  it('o Brand Studio envia os valores em edição para o iframe', () => {
    expect(studio).toContain('override={{ theme, layout, branding: palette }}');
    expect(livePreview).toContain('postMessage(');
    expect(livePreview).toContain('window.location.origin');
  });

  it('a prévia só aceita mensagens da mesma origem e da estrutura conhecida', () => {
    expect(previewHook).toContain('if (event.origin !== window.location.origin) return;');
    expect(previewHook).toContain('PreviewOverrideMessageSchema.safeParse(event.data)');
    expect(previewHook).toContain('.strict()');
  });

  it('a página pública normal ignora mensagens de preview', () => {
    expect(previewHook).toContain("get('preview') === '1' && window.parent !== window");
    expect(previewHook).toContain('if (!isPreviewEmbedded()) return undefined;');
  });

  it('nada é persistido pela prévia', () => {
    expect(previewHook).not.toContain('httpClient');
    expect(previewHook).not.toContain('PATCH');
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

  it('mantém apenas a logo em Marca, com o mesmo endpoint', () => {
    expect(studio).toContain("kind: 'LOGO'");
    expect(studio).toContain('/tenant/media/${kind}');
  });

  it('não configura mais ícone nem tela de abertura em Marca', () => {
    for (const kind of ['APP_ICON', 'SPLASH']) expect(studio).not.toContain(kind);
    expect(studio).not.toContain('Usar meu logo automaticamente');
  });

  it('ícone e splash vivem na tela Aplicativo, sem endpoint novo', () => {
    for (const kind of ['APP_ICON', 'SPLASH']) expect(pwaModule).toContain(`kind: '${kind}'`);
    expect(pwaModule).toContain('/tenant/media/${kind}');
    expect(pwaModule).toContain('Usar meu logo automaticamente');
    expect(pwaModule).toContain('BrandAssetCard');
  });

  it('não duplica a imagem em previews extras', () => {
    expect(studio).not.toContain('brand-device-preview');
    expect(studio).not.toContain('brand-home-screen-preview');
  });
});
