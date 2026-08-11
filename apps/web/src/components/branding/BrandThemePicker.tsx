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
          <span className="theme-miniature" aria-hidden="true">
            <span className="theme-miniature-header"><i /><b /></span>
            <span className="theme-miniature-hero"><i /><i /><b /></span>
            <span className="theme-miniature-services"><i /><i /><i /></span>
          </span>
          <strong>{theme.name}</strong>
          <span>{theme.description}</span>
          <small>{theme.audience}</small>
          <b>{value === theme.code ? 'Selecionado' : 'Selecionar tema'}</b>
        </button>
      ))}
    </div>
  );
}
