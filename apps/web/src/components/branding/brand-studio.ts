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
const hex = (value: number) =>
  Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();

export function mixHex(base: string, target: string, amount: number): string {
  return `#${[1, 3, 5].map((offset) => hex(channel(base, offset) * (1 - amount) + channel(target, offset) * amount)).join('')}`;
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
