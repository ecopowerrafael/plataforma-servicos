import { BRAND_THEMES, type BrandThemeCode } from './brand-studio.js';
import { useAllThemeFonts } from '../../themes/theme-fonts.js';

export function BrandThemePicker({
  value,
  onChange,
}: {
  value: BrandThemeCode;
  onChange: (value: BrandThemeCode) => void;
}) {
  // Cada cartão exibe a tipografia real do tema que representa.
  useAllThemeFonts();
  return (
    <div className="brand-theme-grid">
      {BRAND_THEMES.map((theme) => (
        <button
          key={theme.code}
          className={`brand-theme-card brand-theme-card--${theme.code.toLowerCase()}${value === theme.code ? ' is-selected' : ''}`}
          type="button"
          aria-pressed={value === theme.code}
          onClick={() => {
            onChange(theme.code);
          }}
        >
          {/* Mini prévia abstrata: comunica a direção visual, não a página. */}
          <span className="theme-miniature" aria-hidden="true">
            <span className="theme-miniature-header">
              <i />
              <b />
            </span>
            <span className="theme-miniature-hero">
              <i />
              <i />
              <b />
            </span>
            <span className="theme-miniature-services">
              <i />
              <i />
              <i />
            </span>
          </span>
          <strong>{theme.name}</strong>
          <span>{theme.description}</span>
          <small>{theme.audience}</small>
          <b>{value === theme.code ? 'Selecionado' : 'Selecionar'}</b>
        </button>
      ))}
    </div>
  );
}
