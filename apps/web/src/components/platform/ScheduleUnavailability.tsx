import { ProfessionalListResponseSchema, ProfessionalUnavailabilityListResponseSchema, CreateProfessionalUnavailabilityRequestSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { ErrorState } from './PlatformUi.js';

const typeLabels: Record<string, string> = {
  BLOCK: 'Bloqueio',
  DAY_OFF: 'Folga',
  VACATION: 'Férias',
  SICK_LEAVE: 'Afastamento',
  PERSONAL: 'Compromisso pessoal',
  OTHER: 'Outro',
};

const dateTime = (value: string) => new Date(value).toLocaleString('pt-BR');
const dateOnly = (value: string) => new Date(value).toLocaleDateString('pt-BR');

export function ScheduleUnavailability({ tenantPublicId }: { tenantPublicId: string }) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [formData, setFormData] = useState({
    professionalPublicId: '',
    type: 'BLOCK',
    title: '',
    reason: '',
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 86400000).toISOString(),
    allDay: false,
    repeatsWeekly: false,
    recurrenceEndsAt: '',
  });

  const { data: professionals } = useQuery({
    queryKey: ['platform', tenantPublicId, 'professionals'],
    queryFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/professionals?page=1&limit=100`, {
        schema: ProfessionalListResponseSchema,
      }),
  });

  const { data: unavailabilities, isLoading } = useQuery({
    queryKey: ['platform', tenantPublicId, 'unavailabilities'],
    enabled: professionals && professionals.items.length > 0,
    queryFn: () => {
      const now = new Date();
      const twoMonthsFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
      const from = now.toISOString();
      const to = twoMonthsFromNow.toISOString();

      return Promise.all(
        (professionals?.items || []).map((pro) =>
          httpClient.request(
            `/platform/tenants/${tenantPublicId}/professionals/${pro.publicId}/unavailabilities?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
            { schema: ProfessionalUnavailabilityListResponseSchema },
          ),
        ),
      ).then((results) => results.flatMap((r, idx) => r.items.map((item) => ({ ...item, professionalName: professionals!.items[idx].publicName }))));
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      httpClient.request(
        `/platform/tenants/${tenantPublicId}/professionals/${formData.professionalPublicId}/unavailabilities`,
        {
          method: 'POST',
          body: {
            type: formData.type,
            title: formData.title,
            reason: formData.reason || undefined,
            startsAt: formData.startsAt,
            endsAt: formData.endsAt,
            allDay: formData.allDay,
            repeatsWeekly: formData.repeatsWeekly,
            recurrenceEndsAt: formData.repeatsWeekly ? formData.recurrenceEndsAt : undefined,
          },
          schema: ProfessionalUnavailabilityListResponseSchema,
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', tenantPublicId, 'unavailabilities'] });
      setCreateOpen(false);
      setFormData({
        professionalPublicId: '',
        type: 'BLOCK',
        title: '',
        reason: '',
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 86400000).toISOString(),
        allDay: false,
        repeatsWeekly: false,
        recurrenceEndsAt: '',
      });
    },
  });

  if (isLoading)
    return (
      <article className="platform-panel">
        <p style={{ margin: 0, textAlign: 'center', color: '#99958f' }}>Carregando...</p>
      </article>
    );

  const items = unavailabilities || [];

  return (
    <article className="platform-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.125rem' }}>Indisponibilidades</h2>
        <button onClick={() => setCreateOpen(true)} className="action-button primary" style={{ padding: '0.5rem 1rem' }}>
          + Nova indisponibilidade
        </button>
      </div>

      {createMutation.error instanceof Error && <ErrorState error={createMutation.error.message} />}

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
          onClick={() => setCreateOpen(false)}
        >
          <article className="platform-panel" style={{ maxWidth: '500px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 1.5rem 0', fontSize: '1.25rem' }}>Nova indisponibilidade</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem', maxHeight: '60vh', overflowY: 'auto' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>Profissional *</span>
                <select
                  value={formData.professionalPublicId}
                  onChange={(e) => setFormData({ ...formData, professionalPublicId: e.target.value })}
                  style={{ padding: '0.65rem 0.85rem', border: '1px solid #ede8e1', borderRadius: '10px', fontSize: '0.88rem' }}
                >
                  <option value="">Selecione um profissional</option>
                  {(professionals?.items || []).map((pro) => (
                    <option key={pro.publicId} value={pro.publicId}>
                      {pro.publicName}
                    </option>
                  ))}
                </select>
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
                <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>Título *</span>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Motivo ou descrição"
                  style={{ padding: '0.65rem 0.85rem', border: '1px solid #ede8e1', borderRadius: '10px', fontSize: '0.88rem' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>Observação</span>
                <textarea
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="Detalhes adicionais (opcional)"
                  rows={2}
                  style={{ padding: '0.65rem 0.85rem', border: '1px solid #ede8e1', borderRadius: '10px', fontSize: '0.88rem', fontFamily: 'inherit' }}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={formData.allDay}
                  onChange={(e) => setFormData({ ...formData, allDay: e.target.checked })}
                />
                <span style={{ fontSize: '0.85rem' }}>Dia inteiro</span>
              </label>

              {!formData.allDay && (
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1 }}>
                    <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>Início *</span>
                    <input
                      type="datetime-local"
                      value={formData.startsAt.slice(0, 16)}
                      onChange={(e) => setFormData({ ...formData, startsAt: new Date(e.target.value).toISOString() })}
                      style={{ padding: '0.65rem 0.85rem', border: '1px solid #ede8e1', borderRadius: '10px', fontSize: '0.88rem' }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1 }}>
                    <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>Fim *</span>
                    <input
                      type="datetime-local"
                      value={formData.endsAt.slice(0, 16)}
                      onChange={(e) => setFormData({ ...formData, endsAt: new Date(e.target.value).toISOString() })}
                      style={{ padding: '0.65rem 0.85rem', border: '1px solid #ede8e1', borderRadius: '10px', fontSize: '0.88rem' }}
                    />
                  </label>
                </div>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={formData.repeatsWeekly}
                  onChange={(e) => setFormData({ ...formData, repeatsWeekly: e.target.checked })}
                />
                <span style={{ fontSize: '0.85rem' }}>Recorrência semanal</span>
              </label>

              {formData.repeatsWeekly && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>Fim da recorrência *</span>
                  <input
                    type="date"
                    value={formData.recurrenceEndsAt.slice(0, 10)}
                    onChange={(e) => setFormData({ ...formData, recurrenceEndsAt: new Date(e.target.value).toISOString() })}
                    style={{ padding: '0.65rem 0.85rem', border: '1px solid #ede8e1', borderRadius: '10px', fontSize: '0.88rem' }}
                  />
                </label>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !formData.professionalPublicId} className="action-button primary" style={{ flex: 1 }}>
                {createMutation.isPending ? 'Criando...' : 'Criar'}
              </button>
              <button onClick={() => setCreateOpen(false)} className="action-button secondary" style={{ flex: 1 }} disabled={createMutation.isPending}>
                Cancelar
              </button>
            </div>
          </article>
        </div>
      )}

      {items.length === 0 ? (
        <p style={{ margin: 0, textAlign: 'center', color: '#99958f', fontSize: '0.9rem' }}>Nenhuma indisponibilidade futura.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {items.map((item) => (
            <div key={item.publicId} style={{ padding: '1rem', backgroundColor: '#faf8f5', borderRadius: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div>
                  <p style={{ margin: '0 0 0.25rem 0', fontWeight: 600, fontSize: '0.95rem' }}>{item.professionalName}</p>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#57534e' }}>
                    {item.allDay ? dateOnly(item.startsAt) : dateTime(item.startsAt)}
                    {item.endsAt > item.startsAt && ` — ${item.allDay ? dateOnly(item.endsAt) : dateTime(item.endsAt)}`}
                    {item.repeatsWeekly && ` (recorrente até ${dateOnly(item.recurrenceEndsAt)})`}
                  </p>
                </div>
                <span style={{ backgroundColor: '#e8e3dc', padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, color: '#1c1917' }}>
                  {typeLabels[item.type] || item.type}
                </span>
              </div>
              {item.title && <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: '#1c1917' }}>{item.title}</p>}
              {item.reason && <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#99958f', fontStyle: 'italic' }}>{item.reason}</p>}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
