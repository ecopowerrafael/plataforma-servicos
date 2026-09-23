import { PUBLIC_LAYOUTS, type PublicLayoutCode } from './brand-studio.js';

/** Modelo do aplicativo (estrutura), persistido separadamente do tema. */
export function PublicLayoutPicker({
  value,
  onChange,
}: {
  value: PublicLayoutCode;
  onChange: (value: PublicLayoutCode) => void;
}) {
  return (
    <div className="public-layout-grid">
      {PUBLIC_LAYOUTS.map((layout) => (
        <button
          key={layout.code}
          className={`public-layout-card${value === layout.code ? ' is-selected' : ''}`}
          type="button"
          aria-pressed={value === layout.code}
          onClick={() => {
            onChange(layout.code);
          }}
        >
          {/* Mock estrutural: cabeçalho, conteúdo e (no Premium) navegação. */}
          <span
            className={`public-layout-preview public-layout-preview--${layout.code.toLowerCase()}`}
            aria-hidden="true"
          >
            <i className="layout-header" />
            <i className="layout-body" />
            <i className="layout-body" />
            {layout.code === 'PREMIUM_APP' ? <i className="layout-nav" /> : null}
          </span>
          <strong>{layout.name}</strong>
          <span>{layout.description}</span>
          <b>{value === layout.code ? 'Selecionado' : 'Selecionar modelo'}</b>
        </button>
      ))}
    </div>
  );
}
