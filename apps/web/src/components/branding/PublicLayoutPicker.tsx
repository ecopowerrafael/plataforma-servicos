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
          <span
            className={`public-layout-preview public-layout-preview--${layout.code.toLowerCase()}`}
            aria-hidden="true"
          >
            <i />
            <i />
            <i />
          </span>
          <strong>{layout.name}</strong>
          <span>{layout.description}</span>
          <b>{value === layout.code ? 'Selecionado' : 'Selecionar modelo'}</b>
        </button>
      ))}
    </div>
  );
}
