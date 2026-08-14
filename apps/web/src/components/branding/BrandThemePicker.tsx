import { BRAND_THEMES, type BrandThemeCode } from './brand-studio.js';

export function BrandThemePicker({
  value,
  onChange,
}: {
  value: BrandThemeCode;
  onChange: (value: BrandThemeCode) => void;
}) {
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
            <i className="theme-miniature-bar" />
            <i className="theme-miniature-block" />
            <i className="theme-miniature-line" />
            <i className="theme-miniature-line theme-miniature-line--short" />
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
