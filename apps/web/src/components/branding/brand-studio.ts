import { type TenantBranding } from '@plataforma/shared';

export const BRAND_THEMES = [
  {
    code: 'CLASSIC',
    name: 'Essential',
    description: 'Minimalista e sofisticado.',
    audience: 'Clínicas, consultórios e profissionais liberais.',
  },
  {
    code: 'PREMIUM',
    name: 'Signature',
    description: 'Editorial, elegante e marcante.',
    audience: 'Salões premium, estética, spas e barbearias.',
  },
  {
    code: 'MODERN',
    name: 'Vibrante',
    description: 'Moderno, comercial e expressivo.',
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
>;

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
    };
  return {
    primaryColor: primary,
    secondaryColor: mixHex(primary, '#000000', 0.24),
    accentColor: mixHex(primary, '#FFFFFF', 0.18),
    backgroundColor: mixHex(primary, '#FFFFFF', 0.96),
    surfaceColor: '#FFFFFF',
    textColor: '#0F172A',
    mutedTextColor: '#64748B',
    borderColor: mixHex(primary, '#FFFFFF', 0.82),
  };
}

export function brandThemeName(code: BrandThemeCode): string {
  return BRAND_THEMES.find((theme) => theme.code === code)?.name ?? 'Essential';
}
