import { SUGGESTED_BRAND_COLORS } from './brand-studio.js';

export function BrandColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <section className="brand-color-picker">
      <div>
        <h3>Escolha a cor da sua marca</h3>
        <p>Usaremos esta cor para criar contraste, destaques e estados do seu tema.</p>
      </div>
      <div className="brand-swatches">
        {SUGGESTED_BRAND_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Usar cor ${color}`}
            aria-pressed={value.toUpperCase() === color}
            style={{ backgroundColor: color }}
            onClick={() => {
              onChange(color);
            }}
          />
        ))}
      </div>
      <label>
        Cor personalizada
        <div className="brand-color-field">
          <input
            type="color"
            value={value}
            onChange={(event) => {
              onChange(event.target.value.toUpperCase());
            }}
          />
          <input
            className="control-sm"
            value={value}
            maxLength={7}
            pattern="#[0-9A-Fa-f]{6}"
            onChange={(event) => {
              const next = event.target.value.toUpperCase();
              if (/^#[0-9A-F]{0,6}$/u.test(next)) onChange(next);
            }}
          />
        </div>
      </label>
    </section>
  );
}
