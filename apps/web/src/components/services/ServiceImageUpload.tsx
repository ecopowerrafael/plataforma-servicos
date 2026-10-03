import { useEffect, useState, type ReactNode } from 'react';
import { IconUpload } from '@tabler/icons-react';

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
  buttonClassName,
  disabled = false,
  disabledReason,
  deferUpload = false,
  onSelectFile,
  hasPendingImage = false,
}: {
  busy: boolean;
  hasImage: boolean;
  onRemove: () => Promise<void>;
  onUpload: (file: File) => Promise<void>;
  preview?: ReactNode;
  buttonClassName?: string;
  disabled?: boolean;
  disabledReason?: string;
  deferUpload?: boolean;
  onSelectFile?: (file: File) => void;
  hasPendingImage?: boolean;
}) {
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const choose = (file: File | undefined) => {
    if (file === undefined || disabled) return;
    if (!allowedTypes.has(file.type) || file.size > maxBytes) {
      setError('Selecione uma imagem JPEG, PNG ou WebP de até 5 MB.');
      return;
    }
    setError(null);
    const objectUrl = URL.createObjectURL(file);
    setLocalPreview((current) => {
      if (current !== null) URL.revokeObjectURL(current);
      return objectUrl;
    });
    if (deferUpload) {
      onSelectFile?.(file);
      return;
    }
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
  useEffect(() => () => {
    if (localPreview !== null) URL.revokeObjectURL(localPreview);
  }, [localPreview]);
  const canRemove = hasImage || hasPendingImage || localPreview !== null;
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
        <label aria-disabled={disabled} className={`secondary-button service-image-button${buttonClassName ? ` ${buttonClassName}` : ''}${disabled ? ' is-disabled' : ''}`}>
          <IconUpload aria-hidden="true" size={17} />
          {hasImage ? 'Substituir imagem' : 'Fazer Upload'}
          <input
            accept="image/jpeg,image/png,image/webp"
            disabled={busy || disabled}
            type="file"
            onChange={(event) => {
              choose(event.target.files?.[0]);
            }}
          />
        </label>
        {canRemove && (
          <button
            className="secondary-button"
            disabled={busy}
            type="button"
            onClick={() => {
              if (localPreview !== null) {
                URL.revokeObjectURL(localPreview);
                setLocalPreview(null);
              }
              void onRemove();
            }}
          >
            Remover
          </button>
        )}
      </div>
      {disabled && disabledReason !== undefined && <small className="service-image-disabled-hint">{disabledReason}</small>}
      {error !== null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
