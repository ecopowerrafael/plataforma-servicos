import { contrastTextColor, SUGGESTED_BRAND_COLORS, type BrandPalette } from './brand-studio.js';

/**
 * Cada controle corresponde a um token realmente persistido em
 * `tenant_branding` e consumido pela página pública (`--tenant-*`). Não há
 * campo aqui sem destino real.
 */
export const PALETTE_FIELDS = [
  {
    key: 'primaryColor',
    label: 'Cor principal',
    hint: 'Botões, links e destaques.',
  },
  { key: 'secondaryColor', label: 'Cor secundária', hint: 'Apoio e estados pressionados.' },
  { key: 'accentColor', label: 'Cor de realce', hint: 'Selos, ícones e detalhes.' },
  { key: 'backgroundColor', label: 'Cor de fundo', hint: 'Fundo geral da página.' },
  { key: 'surfaceColor', label: 'Cor dos cards', hint: 'Superfícies e blocos.' },
  { key: 'textColor', label: 'Cor do texto principal', hint: 'Títulos e conteúdo.' },
  { key: 'mutedTextColor', label: 'Cor do texto secundário', hint: 'Legendas e descrições.' },
  { key: 'borderColor', label: 'Cor das bordas', hint: 'Divisórias e contornos.' },
] as const satisfies readonly { key: keyof BrandPalette; label: string; hint: string }[];

const HEX = /^#[0-9A-Fa-f]{6}$/u;

/** Contraste WCAG aproximado, só para avisar — nunca altera a cor escolhida. */
function lowContrast(foreground: string, background: string): boolean {
  if (!HEX.test(foreground) || !HEX.test(background)) return false;
  return contrastTextColor(background) !== foreground.toUpperCase()
    ? contrastRatio(foreground, background) < 4.5
    : false;
}

function channel(hex: string, offset: number): number {
  const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

function luminance(color: string): number {
  return 0.2126 * channel(color, 1) + 0.7152 * channel(color, 3) + 0.0722 * channel(color, 5);
}

function contrastRatio(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function BrandColorPalette({
  palette,
  onChange,
  onApplyPreset,
  onRestoreTheme,
}: {
  palette: BrandPalette;
  onChange: (key: keyof BrandPalette, value: string) => void;
  onApplyPreset: (color: string) => void;
  onRestoreTheme: () => void;
}) {
  const textWarning = lowContrast(palette.textColor, palette.surfaceColor);

  return (
    <div className="brand-palette">
      <div className="brand-palette-presets">
        <span>Presets</span>
        {SUGGESTED_BRAND_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Aplicar preset ${color}`}
            style={{ backgroundColor: color }}
            onClick={() => {
              onApplyPreset(color);
            }}
          />
        ))}
        <button className="text-button button--sm" type="button" onClick={onRestoreTheme}>
          Restaurar cores do tema
        </button>
      </div>
      <div className="brand-palette-grid">
        {PALETTE_FIELDS.map((field) => (
          <label className="brand-palette-field" key={field.key}>
            <span>
              {field.label}
              <small>{field.hint}</small>
            </span>
            <span className="brand-color-field">
              <input
                type="color"
                aria-label={field.label}
                value={HEX.test(palette[field.key]) ? palette[field.key] : '#000000'}
                onChange={(event) => {
                  onChange(field.key, event.target.value.toUpperCase());
                }}
              />
              <input
                className="control-sm"
                aria-label={`${field.label} em hexadecimal`}
                value={palette[field.key]}
                maxLength={7}
                onChange={(event) => {
                  const next = event.target.value.toUpperCase();
                  if (/^#[0-9A-F]{0,6}$/u.test(next)) onChange(field.key, next);
                }}
              />
            </span>
          </label>
        ))}
      </div>
      {textWarning ? (
        <p className="brand-palette-warning" role="status">
          O texto principal tem pouco contraste sobre a cor dos cards. Sua escolha foi mantida —
          ajuste se quiser melhorar a legibilidade.
        </p>
      ) : null}
    </div>
  );
}
