import { useState, type ReactNode } from 'react';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxBytes = 5 * 1024 * 1024;

/**
 * Envio, substituição e remoção da imagem do serviço. A persistência usa os
 * endpoints já existentes (`PUT`/`DELETE /tenant/services/:id/image`).
 */
export function ServiceImageUpload({
  busy,
  hasImage,
  onRemove,
  onUpload,
  preview,
}: {
  busy: boolean;
  hasImage: boolean;
  onRemove: () => Promise<void>;
  onUpload: (file: File) => Promise<void>;
  preview?: ReactNode;
}) {
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const choose = (file: File | undefined) => {
    if (file === undefined) return;
    if (!allowedTypes.has(file.type) || file.size > maxBytes) {
      setError('Selecione uma imagem JPEG, PNG ou WebP de até 5 MB.');
      return;
    }
    setError(null);
    const objectUrl = URL.createObjectURL(file);
    setLocalPreview(objectUrl);
    void onUpload(file)
      .then(() => {
        setLocalPreview(null);
      })
      .catch((caught: unknown) => {
        setLocalPreview(null);
        setError(
          caught instanceof Error ? caught.message : 'Não foi possível enviar a imagem.',
        );
      })
      .finally(() => {
        URL.revokeObjectURL(objectUrl);
      });
  };
  return (
    <section aria-label="Imagem do serviço" className="service-image-upload">
      <p className="ds-eyebrow">Imagem principal</p>
      <div className="service-image-frame">
        {localPreview !== null ? (
          <img alt="Pré-visualização da imagem" className="service-thumbnail" src={localPreview} />
        ) : hasImage ? (
          (preview ?? null)
        ) : (
          <div className="service-image-empty">
            <span aria-hidden="true">🖼</span>
            <strong>Sem imagem</strong>
            <small>Use JPG, PNG ou WebP de até 5 MB.</small>
          </div>
        )}
      </div>
      <div className="service-image-actions">
        <label className="secondary-button service-image-button">
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
        {hasImage && (
          <button
            className="secondary-button"
            disabled={busy}
            type="button"
            onClick={() => {
              void onRemove();
            }}
          >
            Remover
          </button>
        )}
      </div>
      {error !== null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
