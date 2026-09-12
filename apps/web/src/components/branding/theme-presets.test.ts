import { describe, expect, it } from 'vitest';

import {
  brandThemeName,
  deriveBrandPalette,
  resolveSavedPalette,
  themeDefaultPalette,
  THEME_PRESETS,
} from './brand-studio.js';

const LUXURY_PRIMARY = '#C79A5B';

describe('presets de cor por tema', () => {
  it('Essential aplica a paleta azul ao ser escolhido', () => {
    const palette = themeDefaultPalette('CLASSIC', '#00A86B');
    expect(palette.primaryColor).toBe('#1D4ED8');
    expect(palette.backgroundColor).toBe(THEME_PRESETS.CLASSIC.background);
    expect(palette.borderColor).toBe(THEME_PRESETS.CLASSIC.border);
  });

  it('Vibrante aplica a paleta rosa ao ser escolhido', () => {
    const palette = themeDefaultPalette('MODERN', '#00A86B');
    expect(palette.primaryColor).toBe('#E1418A');
    expect(palette.accentColor).toBe(THEME_PRESETS.MODERN.accent);
    expect(palette.backgroundColor).toBe(THEME_PRESETS.MODERN.background);
  });

  it('Aura aplica a paleta lilás e mantém a chave interna PREMIUM', () => {
    const palette = themeDefaultPalette('PREMIUM', '#00A86B');
    expect(palette.primaryColor).toBe('#8B5CF6');
    expect(palette.backgroundColor).toBe(THEME_PRESETS.PREMIUM.background);
    expect(brandThemeName('PREMIUM')).toBe('Aura');
  });

  it('cada tema tem uma cor principal distinta', () => {
    const primaries = ['CLASSIC', 'MODERN', 'PREMIUM'] as const;
    expect(new Set(primaries.map((code) => THEME_PRESETS[code].primary)).size).toBe(3);
  });

  it('troca explícita de tema substitui o preset anterior', () => {
    const essential = themeDefaultPalette('CLASSIC', '#00A86B');
    const vibrante = themeDefaultPalette('MODERN', essential.primaryColor);
    expect(vibrante.primaryColor).toBe(THEME_PRESETS.MODERN.primary);
    expect(vibrante.backgroundColor).not.toBe(essential.backgroundColor);
  });

  it('Luxury mantém a própria paleta ao ser escolhido', () => {
    const palette = themeDefaultPalette('LUXURY', LUXURY_PRIMARY);
    expect(palette).toEqual(deriveBrandPalette(LUXURY_PRIMARY, 'LUXURY'));
    expect(palette.primaryColor).toBe(LUXURY_PRIMARY);
    expect(palette.backgroundColor).toBe('#0B0B0C');
  });
});

describe('personalização manual do tenant', () => {
  it('mantém a cor salva ao recarregar, sem reaplicar o preset', () => {
    const saved = { ...themeDefaultPalette('CLASSIC', '#1D4ED8'), primaryColor: '#00A86B' };
    const reloaded = resolveSavedPalette(saved, 'CLASSIC');
    expect(reloaded.primaryColor).toBe('#00A86B');
    expect(reloaded).toEqual(saved);
  });

  it('preenche com o preset apenas os tokens nunca escolhidos', () => {
    const reloaded = resolveSavedPalette({ primaryColor: '#8B5CF6', headerColor: null }, 'PREMIUM');
    expect(reloaded.primaryColor).toBe('#8B5CF6');
    expect(reloaded.headerColor).toBe(THEME_PRESETS.PREMIUM.background);
  });

  it('deriva os demais tokens a partir de uma cor personalizada', () => {
    const palette = deriveBrandPalette('#00A86B', 'MODERN');
    expect(palette.primaryColor).toBe('#00A86B');
    expect(palette.backgroundColor).not.toBe(THEME_PRESETS.MODERN.background);
    expect(palette.surfaceColor).toBe('#FFFFFF');
  });
});
