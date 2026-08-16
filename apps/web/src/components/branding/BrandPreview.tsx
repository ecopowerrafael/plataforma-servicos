import { type CSSProperties } from 'react';

import {
  type BrandThemeCode,
  brandThemeName,
  contrastTextColor,
  deriveBrandPalette,
} from './brand-studio.js';
import { useAllThemeFonts } from '../../themes/theme-fonts.js';

export function BrandPreview({
  displayName,
  theme,
  color,
  logoUrl,
  mode,
}: {
  displayName: string;
  theme: BrandThemeCode;
  color: string;
  logoUrl?: string | undefined;
  mode: 'mobile' | 'desktop';
}) {
  useAllThemeFonts();
  const palette = /^#[0-9A-Fa-f]{6}$/u.test(color)
    ? deriveBrandPalette(color, theme)
    : deriveBrandPalette('#2457D6', theme);
  return (
    <div
      className={`brand-preview-frame brand-preview-frame--${mode}`}
      style={
        {
          '--preview-primary': palette.primaryColor,
          '--preview-on-primary': contrastTextColor(palette.primaryColor),
          '--preview-primary-dark': palette.secondaryColor,
          '--preview-secondary': palette.secondaryColor,
          '--preview-soft': palette.backgroundColor,
          '--preview-background': palette.backgroundColor,
          '--preview-surface': palette.surfaceColor,
          '--preview-text': palette.textColor,
          '--preview-border': palette.borderColor,
        } as CSSProperties
      }
    >
      <div className={`brand-preview-page brand-preview-page--${theme.toLowerCase()}`}>
        <header>
          {logoUrl === undefined ? (
            <strong>{displayName}</strong>
          ) : (
            <img src={logoUrl} alt="Logo no preview" />
          )}
          <span>Serviços</span>
        </header>
        <section className="brand-preview-hero">
          <small>{brandThemeName(theme)}</small>
          <h2>{displayName || 'Seu estabelecimento'}</h2>
          <p>Experiências pensadas para você.</p>
          <button type="button">Agendar horário</button>
        </section>
        <section className="brand-preview-services">
          <h3>Serviços</h3>
          <article>
            <i />
            <div>
              <strong>Serviço em destaque</strong>
              <span>45 min</span>
            </div>
          </article>
          <article>
            <i />
            <div>
              <strong>Atendimento personalizado</strong>
              <span>60 min</span>
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
