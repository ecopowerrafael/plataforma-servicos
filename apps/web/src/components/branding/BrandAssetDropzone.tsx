import { useId, useState } from 'react';

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;
const MIN_DIMENSION = 32;
const MAX_DIMENSION = 4096;

export function BrandAssetDropzone({
  title,
  description,
  previewUrl,
  busy,
  square = false,
  onUpload,
  onRemove,
}: {
  title: string;
  description: string;
  previewUrl?: string | undefined;
  busy: boolean;
  square?: boolean | undefined;
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
  return (
    <section className="brand-upload-card">
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <label
        className="brand-dropzone"
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          void accept(event.dataTransfer.files[0]);
        }}
      >
        {previewUrl === undefined ? (
          <span className="brand-upload-placeholder">Sua imagem aparecerá aqui</span>
        ) : (
          <img src={previewUrl} alt={`Preview: ${title}`} />
        )}
        <strong>{busy ? 'Processando imagem…' : 'Arraste sua imagem aqui'}</strong>
        <span>ou escolha um arquivo</span>
        <small>PNG, JPG ou WebP · máximo de 5 MB{square ? ' · formato quadrado' : ''}</small>
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
      </label>
      {busy ? (
        <span className="brand-upload-progress" role="progressbar" aria-label="Enviando imagem">
          <i />
        </span>
      ) : null}
      {error === null ? null : <p className="form-error">{error}</p>}
      {previewUrl !== undefined && onRemove !== undefined ? (
        <button className="secondary-button" type="button" disabled={busy} onClick={onRemove}>
          Remover imagem
        </button>
      ) : null}
    </section>
  );
}
