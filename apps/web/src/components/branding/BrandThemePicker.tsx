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
          <span className="theme-miniature">
            <i />
            <i />
            <i />
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
