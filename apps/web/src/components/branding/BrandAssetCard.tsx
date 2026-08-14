import { useId, useState } from 'react';

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;
const MIN_DIMENSION = 32;
const MAX_DIMENSION = 4096;

/**
 * Cartão compacto de imagem da marca. Com imagem, mostra miniatura + ações;
 * sem imagem, vira dropzone pequena. As validações são as mesmas de antes
 * (tipo, tamanho, dimensões e quadrado quando exigido).
 */
export function BrandAssetCard({
  title,
  description,
  previewUrl,
  busy,
  shape = 'wide',
  square = false,
  extraAction,
  onUpload,
  onRemove,
}: {
  title: string;
  description: string;
  previewUrl?: string | undefined;
  busy: boolean;
  shape?: 'wide' | 'portrait' | 'square';
  square?: boolean;
  extraAction?: { label: string; onClick: () => void } | undefined;
  onUpload: (file: File) => void;
  onRemove?: (() => void) | undefined;
}) {
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);

  const accept = async (file: File | undefined) => {
    if (file === undefined) return;
    if (!ACCEPTED_TYPES.has(file.type)) {
      setError('Use uma imagem PNG, JPG ou WebP.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('A imagem precisa ter no máximo 5 MB.');
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const { width, height } = bitmap;
      const validDimensions =
        width >= MIN_DIMENSION &&
        height >= MIN_DIMENSION &&
        width <= MAX_DIMENSION &&
        height <= MAX_DIMENSION;
      bitmap.close();
      if (!validDimensions) {
        setError('Use uma imagem entre 32 e 4096 pixels de largura e altura.');
        return;
      }
      if (square && width !== height) {
        setError('O ícone do aplicativo precisa ser uma imagem quadrada.');
        return;
      }
    } catch {
      setError('Não foi possível ler esta imagem. Escolha outro arquivo.');
      return;
    }
    setError(null);
    onUpload(file);
  };

  const input = (
    <input
      id={inputId}
      hidden
      type="file"
      accept="image/png,image/jpeg,image/webp"
      disabled={busy}
      onChange={(event) => {
        void accept(event.target.files?.[0]);
        event.currentTarget.value = '';
      }}
    />
  );

  return (
    <article
      className={`brand-asset-card brand-asset-card--${shape}`}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        void accept(event.dataTransfer.files[0]);
      }}
    >
      {previewUrl === undefined ? (
        <label className="brand-asset-dropzone" htmlFor={inputId}>
          <span aria-hidden="true">+</span>
          <strong>{busy ? 'Enviando…' : 'Arraste ou escolha'}</strong>
          <small>PNG, JPG ou WebP · até 5 MB{square ? ' · quadrada' : ''}</small>
          {input}
        </label>
      ) : (
        <div className="brand-asset-thumb">
          <img src={previewUrl} alt={title} />
        </div>
      )}
      <div className="brand-asset-info">
        <strong>{title}</strong>
        <small>{description}</small>
        <div className="brand-asset-actions">
          <label className="secondary-button button--sm" htmlFor={inputId}>
            {previewUrl === undefined ? 'Enviar' : 'Alterar'}
            {previewUrl === undefined ? null : input}
          </label>
          {previewUrl === undefined || onRemove === undefined ? null : (
            <button
              className="text-button button--sm"
              type="button"
              disabled={busy}
              onClick={onRemove}
            >
              Remover
            </button>
          )}
          {extraAction === undefined ? null : (
            <button
              className="text-button button--sm"
              type="button"
              disabled={busy}
              onClick={extraAction.onClick}
            >
              {extraAction.label}
            </button>
          )}
        </div>
        {error === null ? null : <p className="form-error">{error}</p>}
      </div>
    </article>
  );
}
