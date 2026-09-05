import { type TenantBranding } from '@plataforma/shared';

export const BRAND_THEMES = [
  {
    code: 'CLASSIC',
    name: 'Essential',
    description: 'Azul clean, objetivo e profissional.',
    audience: 'Clínicas, consultórios e profissionais liberais.',
  },
  {
    // Chave interna preservada (`PREMIUM`); "Aura" é apenas o nome de exibição.
    code: 'PREMIUM',
    name: 'Aura',
    description: 'Lilás sereno, editorial e elegante.',
    audience: 'Spas, wellness, estética e terapias.',
  },
  {
    code: 'MODERN',
    name: 'Vibrante',
    description: 'Rosa energético, arredondado e expressivo.',
    audience: 'Beleza, tatuagem, academias e negócios criativos.',
  },
  {
    code: 'LUXURY',
    name: 'Luxury',
    description: 'Grafite profundo com dourado e contraste alto.',
    audience: 'Barbearias, studios e marcas premium.',
  },
] as const;

/** Modelo (estrutura/UX) do app público — não define cores. */
export const PUBLIC_LAYOUTS = [
  {
    code: 'CLASSIC',
    name: 'Clássico',
    description: 'Página institucional com seções e agendamento na própria página.',
  },
  {
    code: 'PREMIUM_APP',
    name: 'App Premium',
    description: 'Experiência de aplicativo, com navegação inferior e blocos compactos.',
  },
] as const;

export type PublicLayoutCode = (typeof PUBLIC_LAYOUTS)[number]['code'];

export type BrandThemeCode = (typeof BRAND_THEMES)[number]['code'];

export const SUGGESTED_BRAND_COLORS = [
  '#2457D6',
  '#0F766E',
  '#7C3AED',
  '#C2410C',
  '#BE185D',
  '#111827',
] as const;

const channel = (hex: string, offset: number) => Number.parseInt(hex.slice(offset, offset + 2), 16);
const linearChannel = (value: number) => {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
};
const hex = (value: number) =>
  Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();

export function mixHex(base: string, target: string, amount: number): string {
  return `#${[1, 3, 5].map((offset) => hex(channel(base, offset) * (1 - amount) + channel(target, offset) * amount)).join('')}`;
}

export function contrastTextColor(background: string): '#0F172A' | '#FFFFFF' {
  const luminance =
    0.2126 * linearChannel(channel(background, 1)) +
    0.7152 * linearChannel(channel(background, 3)) +
    0.0722 * linearChannel(channel(background, 5));
  const darkContrast = (luminance + 0.05) / 0.068;
  const lightContrast = 1.05 / (luminance + 0.05);
  return darkContrast >= lightContrast ? '#0F172A' : '#FFFFFF';
}

/** Tokens de cor realmente persistidos e consumidos pela página pública. */
export type BrandPalette = Pick<
  TenantBranding,
  | 'primaryColor'
  | 'secondaryColor'
  | 'accentColor'
  | 'backgroundColor'
  | 'surfaceColor'
  | 'textColor'
  | 'mutedTextColor'
  | 'borderColor'
> & {
  /** Tokens semânticos: podem ficar nulos e seguir o valor derivado. */
  onPrimaryColor: string;
  headerColor: string;
  headerTextColor: string;
  navigationColor: string;
  activeColor: string;
};

/**
 * Preset visual de cada tema: é a única fonte das cores/tipografia padrão.
 * `LUXURY` não entra aqui — ele mantém exatamente a derivação já existente.
 */
export const THEME_PRESETS = {
  CLASSIC: {
    /** Azul aplicado quando o tenant escolhe o tema explicitamente. */
    primary: '#1D4ED8',
    primaryHover: '#1E3A8A',
    accent: '#3B82F6',
    background: '#F4F7FC',
    surface: '#FFFFFF',
    text: '#0F172A',
    muted: '#5B6B85',
    border: '#DCE4F2',
    /** Quanto do branco entra no fundo derivado de uma cor personalizada. */
    backgroundMix: 0.955,
    borderMix: 0.84,
  },
  MODERN: {
    primary: '#E1418A',
    primaryHover: '#BE185D',
    accent: '#FB7185',
    background: '#FFF4F8',
    surface: '#FFFFFF',
    text: '#2C1220',
    muted: '#8A6274',
    border: '#F8D9E5',
    backgroundMix: 0.94,
    borderMix: 0.8,
  },
  PREMIUM: {
    primary: '#8B5CF6',
    primaryHover: '#6D28D9',
    accent: '#C4B5FD',
    background: '#F7F4FE',
    surface: '#FFFFFF',
    text: '#241A3D',
    muted: '#6F6390',
    border: '#E7DFF9',
    backgroundMix: 0.95,
    borderMix: 0.86,
  },
} as const satisfies Record<
  Exclude<BrandThemeCode, 'LUXURY'>,
  {
    primary: string;
    primaryHover: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    muted: string;
    border: string;
    backgroundMix: number;
    borderMix: number;
  }
>;

/**
 * Paleta padrão do tema, aplicada apenas quando o tenant **escolhe** um tema.
 * O carregamento da página nunca chama isto: lá vale o que está persistido.
 */
export function themeDefaultPalette(
  theme: BrandThemeCode,
  currentPrimaryColor: string,
): BrandPalette {
  // Luxury mantém a paleta atual do tenant (derivada da cor principal dele).
  if (theme === 'LUXURY') return deriveBrandPalette(currentPrimaryColor, 'LUXURY');
  return deriveBrandPalette(THEME_PRESETS[theme].primary, theme);
}

/** O tema Luxury trabalha sobre superfícies escuras; os demais seguem claros. */
export function deriveBrandPalette(
  primaryColor: string,
  theme: BrandThemeCode = 'CLASSIC',
): BrandPalette {
  const primary = primaryColor.toUpperCase();
  if (theme === 'LUXURY')
    return {
      primaryColor: primary,
      secondaryColor: mixHex(primary, '#000000', 0.35),
      accentColor: mixHex(primary, '#FFFFFF', 0.22),
      backgroundColor: '#0B0B0C',
      surfaceColor: '#141416',
      textColor: '#F5F1E8',
      mutedTextColor: '#A7A29A',
      borderColor: '#2A2A2E',
      onPrimaryColor: contrastTextColor(primary),
      headerColor: '#0B0B0C',
      headerTextColor: '#F5F1E8',
      navigationColor: '#141416',
      activeColor: primary,
    };
  const preset = THEME_PRESETS[theme];
  // Com a cor padrão do tema a paleta é exatamente a desenhada para ele; com
  // uma cor personalizada os demais tokens são derivados no mesmo espírito.
  const isPresetPrimary = primary === preset.primary;
  const background = isPresetPrimary
    ? preset.background
    : mixHex(primary, '#FFFFFF', preset.backgroundMix);
  return {
    primaryColor: primary,
    secondaryColor: isPresetPrimary ? preset.primaryHover : mixHex(primary, '#000000', 0.24),
    accentColor: isPresetPrimary ? preset.accent : mixHex(primary, '#FFFFFF', 0.18),
    backgroundColor: background,
    surfaceColor: preset.surface,
    textColor: preset.text,
    mutedTextColor: preset.muted,
    borderColor: isPresetPrimary ? preset.border : mixHex(primary, '#FFFFFF', preset.borderMix),
    onPrimaryColor: contrastTextColor(primary),
    headerColor: background,
    headerTextColor: preset.text,
    navigationColor: preset.surface,
    activeColor: primary,
  };
}

export function brandThemeName(code: BrandThemeCode): string {
  return BRAND_THEMES.find((theme) => theme.code === code)?.name ?? 'Essential';
}

/** Tokens de cor persistidos, na ordem em que aparecem no editor. */
export const PALETTE_KEYS = [
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
] as const satisfies readonly (keyof BrandPalette)[];

/**
 * Paleta mostrada ao abrir a tela: o que está salvo sempre vence. O preset do
 * tema só preenche tokens que o tenant nunca escolheu — nenhum carregamento de
 * página sobrescreve uma cor personalizada.
 */
export function resolveSavedPalette(
  branding: Partial<Record<keyof BrandPalette, string | null>> | undefined,
  theme: BrandThemeCode,
): BrandPalette {
  const derived = deriveBrandPalette(branding?.primaryColor ?? THEME_PRESETS.CLASSIC.primary, theme);
  if (branding === undefined) return derived;
  return Object.fromEntries(
    PALETTE_KEYS.map((key) => [key, branding[key] ?? derived[key]]),
  ) as BrandPalette;
}
