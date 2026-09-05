import { useState } from 'react';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxBytes = 5 * 1024 * 1024;

/** Envio/remoção da imagem do produto; a validação real acontece no backend. */
export function ProductImageUpload({
  busy,
  hasImage,
  onRemove,
  onUpload,
}: {
  busy: boolean;
  hasImage: boolean;
  onRemove: () => Promise<void>;
  onUpload: (file: File) => Promise<void>;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const choose = (file: File | undefined) => {
    if (file === undefined) return;
    if (!allowedTypes.has(file.type) || file.size > maxBytes) {
      setError('Selecione uma imagem JPEG, PNG ou WebP de até 5 MB.');
      return;
    }
    setError(null);
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    void onUpload(file)
      .catch((caught: unknown) => {
        setPreview(null);
        setError(caught instanceof Error ? caught.message : 'Não foi possível enviar a imagem.');
      })
      .finally(() => {
        URL.revokeObjectURL(objectUrl);
      });
  };
  return (
    <section aria-label="Imagem do produto" className="product-image-upload">
      <p className="ds-eyebrow">Imagem</p>
      {preview !== null && (
        <img alt="Pré-visualização da imagem do produto" className="service-thumbnail" src={preview} />
      )}
      <label>
        {hasImage ? 'Substituir imagem' : 'Enviar imagem'}
        <input
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          type="file"
          onChange={(event) => {
            choose(event.target.files?.[0]);
          }}
        />
      </label>
      {error !== null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {hasImage && (
        <button
          className="secondary-button"
          disabled={busy}
          type="button"
          onClick={() => {
            void onRemove();
          }}
        >
          Remover imagem
        </button>
      )}
    </section>
  );
}
