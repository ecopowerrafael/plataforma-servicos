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
  tenantSlug,
  services,
}: {
  displayName: string;
  theme: BrandThemeCode;
  color: string;
  logoUrl?: string | undefined;
  mode: 'mobile' | 'desktop';
  tenantSlug?: string | undefined;
  services?: Array<{ name: string; durationMinutes: number }> | undefined;
}) {
  useAllThemeFonts();
  const palette = /^#[0-9A-Fa-f]{6}$/u.test(color)
    ? deriveBrandPalette(color, theme)
    : deriveBrandPalette('#2457D6', theme);

  if (tenantSlug !== undefined) {
    return (
      <iframe
        src={`/public/${tenantSlug}`}
        title="Preview da página pública"
        className={`brand-preview-iframe brand-preview-iframe--${mode}`}
        style={{
          width: '100%',
          height: mode === 'mobile' ? '812px' : '600px',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
        }}
      />
    );
  }

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
          {(services?.length ? services.slice(0, 3) : [{ name: 'Serviço em destaque', durationMinutes: 45 }, { name: 'Atendimento personalizado', durationMinutes: 60 }]).map((service) => (
            <article key={service.name}>
              <i />
              <div>
                <strong>{service.name}</strong>
                <span>{service.durationMinutes} min</span>
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
