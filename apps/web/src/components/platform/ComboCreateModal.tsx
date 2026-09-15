import { ComboPublicSchema, CreateComboRequestSchema, ServiceListResponseSchema } from '@plataforma/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { ErrorState } from './PlatformUi.js';

type Combo = z.infer<typeof ComboPublicSchema>;
type CreateComboRequest = z.infer<typeof CreateComboRequestSchema>;

export function ComboCreateModal({
  tenantPublicId,
  onClose,
  onComboCreated,
}: {
  tenantPublicId: string;
  onClose: () => void;
  onComboCreated: (combo: Combo) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceCents, setPriceCents] = useState('0');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState('0');

  const { data: servicesData, isLoading: servicesLoading } = useQuery({
    queryKey: ['platform-services', tenantPublicId],
    queryFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/services?page=1&limit=100`, {
        schema: ServiceListResponseSchema,
      }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: CreateComboRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        priceCents: Math.round(parseFloat(priceCents) * 100),
        sortOrder: parseInt(sortOrder),
        active: true,
        items: selectedServices.map((serviceId, idx) => ({
          servicePublicId: serviceId,
          sortOrder: idx,
        })),
      };
      const result = await httpClient.request(
        `/platform/tenants/${tenantPublicId}/combos`,
        {
          method: 'POST',
          body,
          schema: ComboPublicSchema,
        },
      );
      return result;
    },
    onSuccess: (combo) => {
      onComboCreated(combo);
    },
  });

  const services = servicesData?.items || [];
  const isValid = name.trim().length > 0 && selectedServices.length >= 2;

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
        style={{ maxWidth: '500px', width: '90%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 1.5rem 0', fontSize: '1.25rem' }}>Novo combo</h2>

        {createMutation.error instanceof Error && (
          <ErrorState error={createMutation.error.message} />
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.78rem', color: '#1c1917' }}>Nome *</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do combo"
              style={{
                padding: '0.65rem 0.85rem',
                border: '1px solid #ede8e1',
                borderRadius: '10px',
                fontSize: '0.88rem',
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.78rem', color: '#1c1917' }}>Descrição</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o combo (opcional)"
              rows={3}
              style={{
                padding: '0.65rem 0.85rem',
                border: '1px solid #ede8e1',
                borderRadius: '10px',
                fontSize: '0.88rem',
                fontFamily: 'inherit',
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.78rem', color: '#1c1917' }}>Preço (R$) *</span>
            <input
              type="number"
              step="0.01"
              value={priceCents}
              onChange={(e) => setPriceCents(e.target.value)}
              style={{
                padding: '0.65rem 0.85rem',
                border: '1px solid #ede8e1',
                borderRadius: '10px',
                fontSize: '0.88rem',
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.78rem', color: '#1c1917' }}>
              Serviços (mínimo 2) *
            </span>
            {servicesLoading ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#57534e' }}>Carregando serviços...</p>
            ) : services.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#b91c1c' }}>Nenhum serviço disponível.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                {services.map((service) => (
                  <label key={service.publicId} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedServices.includes(service.publicId)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedServices([...selectedServices, service.publicId]);
                        } else {
                          setSelectedServices(selectedServices.filter((id) => id !== service.publicId));
                        }
                      }}
                    />
                    <span style={{ fontSize: '0.88rem' }}>
                      {service.name} · {service.durationMinutes} min
                    </span>
                  </label>
                ))}
              </div>
            )}
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.78rem', color: '#1c1917' }}>Ordem</span>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              style={{
                padding: '0.65rem 0.85rem',
                border: '1px solid #ede8e1',
                borderRadius: '10px',
                fontSize: '0.88rem',
              }}
            />
          </label>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button
              type="button"
              onClick={onClose}
              className="action-button secondary"
              style={{ flex: 1 }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="action-button primary"
              style={{ flex: 1 }}
              disabled={!isValid || createMutation.isPending}
            >
              {createMutation.isPending ? 'Criando...' : 'Criar combo'}
            </button>
          </div>
        </form>
      </article>
    </div>
  );
}
