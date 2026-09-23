import { useEffect } from 'react';

import { type BrandThemeCode } from '../components/branding/brand-studio.js';

/**
 * Cada tema não-Luxury tem a própria tipografia. Só a família do tema ativo é
 * baixada, com os pesos realmente usados no CSS e com `latin-ext` para os
 * acentos do português (ã, õ, á, é, í, ó, ú, â, ê, ç).
 * O Luxury não entra aqui: ele continua com a tipografia atual.
 */
const THEME_FONT_HREF: Partial<Record<BrandThemeCode, string>> = {
  CLASSIC:
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@600;700;800&display=swap',
  MODERN: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap',
  PREMIUM:
    'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Lora:wght@500;600&display=swap',
};

function loadFont(href: string | undefined): void {
  if (href === undefined) return;
  if (document.head.querySelector(`link[href="${href}"]`) !== null) return;
  const preconnect = document.createElement('link');
  preconnect.rel = 'preconnect';
  preconnect.href = 'https://fonts.gstatic.com';
  preconnect.crossOrigin = '';
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.append(preconnect, link);
}

/** Injeta (uma única vez por href) a folha de fontes do tema ativo. */
export function useThemeFont(theme: BrandThemeCode): void {
  useEffect(() => {
    loadFont(THEME_FONT_HREF[theme]);
  }, [theme]);
}

/**
 * Usada onde os temas aparecem lado a lado (seletor e prévia do onboarding),
 * para que cada cartão mostre a própria tipografia.
 */
export function useAllThemeFonts(): void {
  useEffect(() => {
    for (const href of Object.values(THEME_FONT_HREF)) loadFont(href);
  }, []);
}
