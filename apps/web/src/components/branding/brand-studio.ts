import { type TenantBranding } from '@plataforma/shared';

export const BRAND_THEMES = [
  {
    code: 'CLASSIC',
    name: 'Essencial',
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
] as const;

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

export function deriveBrandPalette(
  primaryColor: string,
): Pick<
  TenantBranding,
  | 'primaryColor'
  | 'secondaryColor'
  | 'accentColor'
  | 'backgroundColor'
  | 'surfaceColor'
  | 'textColor'
  | 'mutedTextColor'
  | 'borderColor'
> {
  const primary = primaryColor.toUpperCase();
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
  return BRAND_THEMES.find((theme) => theme.code === code)?.name ?? 'Essencial';
}
