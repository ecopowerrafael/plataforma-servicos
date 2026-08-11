import { useId, useState } from 'react';

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

export function BrandAssetDropzone({
  title,
  description,
  previewUrl,
  busy,
  onUpload,
  onRemove,
}: {
  title: string;
  description: string;
  previewUrl?: string | undefined;
  busy: boolean;
  onUpload: (file: File) => void;
  onRemove?: (() => void) | undefined;
}) {
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const accept = (file: File | undefined) => {
    if (file === undefined) return;
    if (!ACCEPTED_TYPES.has(file.type)) {
      setError('Use uma imagem PNG, JPG ou WebP.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('A imagem precisa ter no máximo 5 MB.');
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
          accept(event.dataTransfer.files[0]);
        }}
      >
        {previewUrl === undefined ? (
          <span className="brand-upload-placeholder">Sua imagem aparecerá aqui</span>
        ) : (
          <img src={previewUrl} alt={`Preview: ${title}`} />
        )}
        <strong>{busy ? 'Processando imagem…' : 'Arraste sua imagem aqui'}</strong>
        <span>ou escolha um arquivo</span>
        <small>PNG, JPG ou WebP · máximo de 5 MB</small>
        <input
          id={inputId}
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={(event) => {
            accept(event.target.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
      </label>
      {error === null ? null : <p className="form-error">{error}</p>}
      {previewUrl !== undefined && onRemove !== undefined ? (
        <button className="secondary-button" type="button" disabled={busy} onClick={onRemove}>
          Remover imagem
        </button>
      ) : null}
    </section>
  );
}
