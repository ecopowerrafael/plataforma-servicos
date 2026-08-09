import { useState } from 'react';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxBytes = 5 * 1024 * 1024;

export function ServiceImageUpload({
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
      setError('Selecione uma imagem JPEG, PNG ou WebP de at\u00e9 5 MB.');
      return;
    }
    setError(null);
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    void onUpload(file)
      .then(() => {
        URL.revokeObjectURL(objectUrl);
      })
      .catch((caught: unknown) => {
        setPreview(null);
        setError(
          caught instanceof Error ? caught.message : 'N\u00e3o foi poss\u00edvel enviar a imagem.',
        );
        URL.revokeObjectURL(objectUrl);
      });
  };
  return (
    <section aria-label="Imagem do servi\u00e7o">
      <h4>Imagem principal</h4>
      {preview !== null && (
        <img alt="Preview da imagem do servi\u00e7o" className="service-thumbnail" src={preview} />
      )}
      <label>
        {'Enviar ou substituir imagem'}
        <input
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(event) => {
            choose(event.target.files?.[0]);
          }}
          type="file"
        />
      </label>
      {error !== null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {hasImage && (
        <button
          disabled={busy}
          onClick={() => {
            void onRemove();
          }}
          type="button"
        >
          Remover imagem
        </button>
      )}
    </section>
  );
}
