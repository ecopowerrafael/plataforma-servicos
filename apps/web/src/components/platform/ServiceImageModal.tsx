import { ServicePublicSchema, SuccessResponseSchema } from '@plataforma/shared';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { PlatformServiceImage } from './PlatformServiceImage.js';

export function ServiceImageModal({
  service,
  tenantPublicId,
  onClose,
  onImageUpdated,
}: {
  service: z.infer<typeof ServicePublicSchema>;
  tenantPublicId: string;
  onClose: () => void;
  onImageUpdated: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageVersion, setImageVersion] = useState(0);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.set('file', file, file.name);
      return httpClient.request(
        `/platform/tenants/${tenantPublicId}/services/${service.publicId}/image`,
        {
          method: 'PUT',
          body,
          schema: ServicePublicSchema,
        },
      );
    },
    onSuccess: () => {
      setSelectedFile(null);
      setPreviewUrl(null);
      setImageVersion((v) => v + 1);
      onImageUpdated();
    },
  });

  const remove = useMutation({
    mutationFn: () =>
      httpClient.request(
        `/platform/tenants/${tenantPublicId}/services/${service.publicId}/image`,
        { method: 'DELETE', schema: SuccessResponseSchema },
      ),
    onSuccess: () => {
      setSelectedFile(null);
      setPreviewUrl(null);
      setImageVersion((v) => v + 1);
      onImageUpdated();
    },
  });

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setPreviewUrl(e.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <section
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '400px', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <h2>Gerenciar imagem</h2>
        <p style={{ fontSize: '0.875rem', color: '#666' }}>{service.name}</p>

        <div style={{ margin: '1.5rem 0', textAlign: 'center' }}>
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Preview"
              style={{
                maxWidth: '100%',
                maxHeight: '200px',
                borderRadius: '8px',
                border: '1px solid #e5e5e5',
              }}
            />
          ) : service.imageUrl ? (
            <PlatformServiceImage
              alt={service.name}
              servicePublicId={service.publicId}
              tenantPublicId={tenantPublicId}
              version={String(imageVersion)}
            />
          ) : (
            <div
              style={{
                width: '200px',
                height: '200px',
                margin: '0 auto',
                backgroundColor: '#f5f5f5',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#999',
                fontSize: '0.875rem',
              }}
            >
              Sem imagem
            </div>
          )}
        </div>

        <label style={{ display: 'block', marginBottom: '1rem' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
              e.target.value = '';
            }}
            disabled={upload.isPending}
          />
          <button
            type="button"
            className="primary-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={upload.isPending || remove.isPending}
            style={{ width: '100%' }}
          >
            {selectedFile ? '✓ Arquivo selecionado' : 'Escolher nova imagem'}
          </button>
        </label>

        {selectedFile && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setSelectedFile(null);
                setPreviewUrl(null);
              }}
              disabled={upload.isPending}
              style={{ flex: 1 }}
            >
              Cancelar seleção
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => selectedFile && upload.mutate(selectedFile)}
              disabled={upload.isPending || !selectedFile}
              style={{ flex: 1 }}
            >
              {upload.isPending ? 'Enviando…' : 'Trocar imagem'}
            </button>
          </div>
        )}

        {service.imageUrl && !selectedFile && (
          <button
            type="button"
            className="danger-button"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            style={{ width: '100%', marginBottom: '1rem' }}
          >
            {remove.isPending ? 'Removendo…' : 'Remover imagem'}
          </button>
        )}

        {upload.error instanceof Error && (
          <p className="form-error">{upload.error.message}</p>
        )}
        {remove.error instanceof Error && (
          <p className="form-error">{remove.error.message}</p>
        )}

        <button
          type="button"
          className="secondary-button"
          onClick={onClose}
          disabled={upload.isPending || remove.isPending}
          style={{ width: '100%' }}
        >
          Fechar
        </button>
      </section>
    </div>
  );
}
