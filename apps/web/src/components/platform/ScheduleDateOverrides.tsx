import { BusinessUnitDateOverridesResponseSchema, ReplaceBusinessUnitDateOverrideRequestSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { ErrorState } from './PlatformUi.js';

const typeLabels: Record<string, string> = {
  HOLIDAY: 'Feriado',
  EXCEPTION: 'Horário especial',
};

const dateOnly = (value: string) => new Date(value).toLocaleDateString('pt-BR');

export function ScheduleDateOverrides({ tenantPublicId, unitPublicId }: { tenantPublicId: string; unitPublicId: string }) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: 'HOLIDAY',
    closed: true,
    title: '',
    periods: [] as { startsAt: string; endsAt: string }[],
  });

  const { data: overrides, isLoading } = useQuery({
    queryKey: ['platform', tenantPublicId, 'units', unitPublicId, 'date-overrides'],
    queryFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/units/${unitPublicId}/date-overrides`, {
        schema: BusinessUnitDateOverridesResponseSchema,
      }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/units/${unitPublicId}/date-overrides/${formData.date}`, {
        method: 'PUT',
        body: {
          type: formData.type,
          closed: formData.closed,
          title: formData.title || undefined,
          periods: formData.closed ? [] : formData.periods,
        },
        schema: BusinessUnitDateOverridesResponseSchema,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['platform', tenantPublicId, 'units', unitPublicId, 'date-overrides'],
      });
      setCreateOpen(false);
      setEditingDate(null);
      setFormData({
        date: new Date().toISOString().slice(0, 10),
        type: 'HOLIDAY',
        closed: true,
        title: '',
        periods: [],
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (date: string) =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/units/${unitPublicId}/date-overrides/${date}`, {
        method: 'DELETE',
        schema: BusinessUnitDateOverridesResponseSchema,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['platform', tenantPublicId, 'units', unitPublicId, 'date-overrides'],
      });
    },
  });

  if (isLoading)
    return (
      <article className="platform-panel">
        <p style={{ margin: 0, textAlign: 'center', color: '#99958f' }}>Carregando...</p>
      </article>
    );

  const items = overrides?.items || [];

  return (
    <article className="platform-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.125rem' }}>Feriados e exceções</h2>
        <button onClick={() => { setCreateOpen(true); setEditingDate(null); }} className="action-button primary" style={{ padding: '0.5rem 1rem' }}>
          + Novo feriado/exceção
        </button>
      </div>

      {(createMutation.error instanceof Error || deleteMutation.error instanceof Error) && (
        <ErrorState error={(createMutation.error || deleteMutation.error)?.message || 'Erro'} />
      )}

      {createOpen && (
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
          onClick={() => { setCreateOpen(false); setEditingDate(null); }}
        >
          <article className="platform-panel" style={{ maxWidth: '500px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 1.5rem 0', fontSize: '1.25rem' }}>
              {editingDate ? 'Editar' : 'Novo'} feriado/exceção
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>Data *</span>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  disabled={editingDate !== null}
                  style={{ padding: '0.65rem 0.85rem', border: '1px solid #ede8e1', borderRadius: '10px', fontSize: '0.88rem' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>Tipo *</span>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  style={{ padding: '0.65rem 0.85rem', border: '1px solid #ede8e1', borderRadius: '10px', fontSize: '0.88rem' }}
                >
                  {Object.entries(typeLabels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>Título</span>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Nome do feriado ou descrição da exceção"
                  style={{ padding: '0.65rem 0.85rem', border: '1px solid #ede8e1', borderRadius: '10px', fontSize: '0.88rem' }}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={formData.closed}
                  onChange={(e) => {
                    setFormData({ ...formData, closed: e.target.checked, periods: e.target.checked ? [] : [{ startsAt: '08:00', endsAt: '18:00' }] });
                  }}
                />
                <span style={{ fontSize: '0.85rem' }}>Dia fechado</span>
              </label>

              {!formData.closed && (
                <div>
                  <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', fontWeight: 600 }}>Períodos de atendimento</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {formData.periods.map((period, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input
                          type="time"
                          value={period.startsAt}
                          onChange={(e) => {
                            const updated = [...formData.periods];
                            updated[idx] = { ...updated[idx], startsAt: e.target.value };
                            setFormData({ ...formData, periods: updated });
                          }}
                          style={{ padding: '0.5rem', border: '1px solid #ede8e1', borderRadius: '6px', fontSize: '0.85rem', flex: 1 }}
                        />
                        <span style={{ fontSize: '0.85rem' }}>até</span>
                        <input
                          type="time"
                          value={period.endsAt}
                          onChange={(e) => {
                            const updated = [...formData.periods];
                            updated[idx] = { ...updated[idx], endsAt: e.target.value };
                            setFormData({ ...formData, periods: updated });
                          }}
                          style={{ padding: '0.5rem', border: '1px solid #ede8e1', borderRadius: '6px', fontSize: '0.85rem', flex: 1 }}
                        />
                        <button
                          onClick={() => setFormData({ ...formData, periods: formData.periods.filter((_, i) => i !== idx) })}
                          className="action-button danger"
                          style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => setFormData({ ...formData, periods: [...formData.periods, { startsAt: '08:00', endsAt: '18:00' }] })}
                      className="action-button primary"
                      style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                    >
                      + Período
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="action-button primary" style={{ flex: 1 }}>
                {createMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
              <button onClick={() => { setCreateOpen(false); setEditingDate(null); }} className="action-button secondary" style={{ flex: 1 }} disabled={createMutation.isPending}>
                Cancelar
              </button>
            </div>
          </article>
        </div>
      )}

      {items.length === 0 ? (
        <p style={{ margin: 0, textAlign: 'center', color: '#99958f', fontSize: '0.9rem' }}>Nenhum feriado ou exceção configurado.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          {items.map((item) => (
            <div key={item.date} style={{ padding: '1rem', backgroundColor: '#faf8f5', borderRadius: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div>
                  <p style={{ margin: '0 0 0.25rem 0', fontWeight: 600, fontSize: '0.95rem' }}>{dateOnly(item.date)}</p>
                  <span style={{ backgroundColor: '#e8e3dc', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, color: '#1c1917' }}>
                    {typeLabels[item.type] || item.type}
                  </span>
                </div>
                <button
                  onClick={() => deleteMutation.mutate(item.date)}
                  disabled={deleteMutation.isPending}
                  className="action-button danger"
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                >
                  Excluir
                </button>
              </div>
              {item.closed ? (
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: '#1c1917' }}>Fechado</p>
              ) : (
                item.periods.map((p, idx) => (
                  <p key={idx} style={{ margin: '0.25rem 0', fontSize: '0.85rem', color: '#1c1917' }}>
                    {p.startsAt} — {p.endsAt}
                  </p>
                ))
              )}
              {item.title && <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: '#99958f', fontStyle: 'italic' }}>{item.title}</p>}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
