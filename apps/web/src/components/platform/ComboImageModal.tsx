import { ComboPublicSchema } from '@plataforma/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { ErrorState } from './PlatformUi.js';

type Combo = z.infer<typeof ComboPublicSchema>;

export function ComboImageModal({
  combo,
  tenantPublicId,
  onClose,
  onImageUpdated,
}: {
  combo: Combo;
  tenantPublicId: string;
  onClose: () => void;
  onImageUpdated: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Nenhum arquivo selecionado');
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(
        `${new URL(httpClient.baseURL || '').origin}/platform/tenants/${tenantPublicId}/combos/${combo.publicId}/image`,
        {
          method: 'PUT',
          body: formData,
          credentials: 'include',
        },
      );
      if (!response.ok) throw new Error('Erro ao enviar imagem');
      return response.json();
    },
    onSuccess: () => {
      onImageUpdated();
      onClose();
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `${new URL(httpClient.baseURL || '').origin}/platform/tenants/${tenantPublicId}/combos/${combo.publicId}/image`,
        {
          method: 'DELETE',
          credentials: 'include',
        },
      );
      if (!response.ok) throw new Error('Erro ao remover imagem');
      return response.json();
    },
    onSuccess: () => {
      onImageUpdated();
      onClose();
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFile = e.target.files?.[0];
    if (newFile) {
      setFile(newFile);
      const reader = new FileReader();
      reader.onload = (event) => {
        setPreview(event.target?.result as string);
      };
      reader.readAsDataURL(newFile);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <article
        className="platform-panel"
        style={{ maxWidth: '450px', width: '90%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 1.5rem 0', fontSize: '1.25rem' }}>Gerenciar imagem</h2>

        {(uploadMutation.error instanceof Error || removeMutation.error instanceof Error) && (
          <ErrorState error={(uploadMutation.error || removeMutation.error)?.message || 'Erro desconhecido'} />
        )}

        <div style={{ marginBottom: '1.5rem' }}>
          {preview ? (
            <div style={{ textAlign: 'center' }}>
              <img src={preview} alt={combo.name} style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px' }} />
              <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.85rem', color: '#57534e' }}>
                {file?.name}
              </p>
            </div>
          ) : combo.imageUrl ? (
            <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#faf8f5', borderRadius: '8px' }}>
              <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', color: '#57534e' }}>Imagem atual</p>
              <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600 }}>Uma imagem está carregada</p>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#fff1f2', borderRadius: '8px' }}>
              <p style={{ margin: 0, fontSize: '0.88rem', color: '#b91c1c' }}>Nenhuma imagem</p>
            </div>
          )}
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '1.5rem' }}>
          <span style={{ fontWeight: 600, fontSize: '0.78rem', color: '#1c1917' }}>
            Escolher novo arquivo (JPG, PNG, máximo 2MB)
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            disabled={uploadMutation.isPending}
            style={{
              padding: '0.65rem 0.85rem',
              border: '1px solid #ede8e1',
              borderRadius: '10px',
              fontSize: '0.88rem',
              cursor: uploadMutation.isPending ? 'not-allowed' : 'pointer',
            }}
          />
        </label>

        <div style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column' }}>
          {file && (
            <button
              onClick={() => uploadMutation.mutate()}
              disabled={uploadMutation.isPending || !file}
              className="action-button primary"
            >
              {uploadMutation.isPending ? 'Enviando…' : 'Enviar imagem'}
            </button>
          )}
          {combo.imageUrl && (
            <button
              onClick={() => removeMutation.mutate()}
              disabled={removeMutation.isPending || uploadMutation.isPending}
              className="action-button danger"
            >
              {removeMutation.isPending ? 'Removendo…' : 'Remover imagem atual'}
            </button>
          )}
          <button onClick={onClose} className="action-button secondary" disabled={uploadMutation.isPending || removeMutation.isPending}>
            Fechar
          </button>
        </div>
      </article>
    </div>
  );
}
