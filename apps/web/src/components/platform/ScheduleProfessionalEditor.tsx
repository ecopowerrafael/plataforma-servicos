import { ProfessionalScheduleResponseSchema, UpsertProfessionalScheduleRequestSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';
import { ErrorState } from './PlatformUi.js';

const weekdayLabel = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

interface Period {
  weekday: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
}

export function ScheduleProfessionalEditor({
  tenantPublicId,
  professionalPublicId,
  onClose,
}: {
  tenantPublicId: string;
  professionalPublicId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [periods, setPeriods] = useState<Period[]>([]);

  const { data: schedule, isLoading } = useQuery({
    queryKey: ['platform', tenantPublicId, 'professionals', professionalPublicId, 'schedule'],
    queryFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/professionals/${professionalPublicId}/schedule`, {
        schema: ProfessionalScheduleResponseSchema,
      }),
    onSuccess: (data) => {
      setPeriods(
        data.items.map((item) => ({
          weekday: item.weekday,
          startsAt: item.startsAt,
          endsAt: item.endsAt,
          active: item.active,
        })),
      );
    },
  });

  const mutation = useMutation({
    mutationFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/professionals/${professionalPublicId}/schedule`, {
        method: 'PUT',
        body: { periods },
        schema: ProfessionalScheduleResponseSchema,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['platform', tenantPublicId, 'professionals', professionalPublicId, 'schedule'],
      });
      queryClient.invalidateQueries({ queryKey: ['platform', tenantPublicId, 'professionals'] });
      onClose();
    },
  });

  const handleChangeTime = (weekday: number, field: 'startsAt' | 'endsAt', value: string) => {
    setPeriods((prev) => {
      const idx = prev.findIndex((p) => p.weekday === weekday);
      if (idx === -1) {
        return [...prev, { weekday, [field]: value, startsAt: '09:00', endsAt: '18:00', active: true }];
      }
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  const handleToggleDayOff = (weekday: number) => {
    setPeriods((prev) => prev.filter((p) => p.weekday !== weekday));
  };

  if (isLoading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>;

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
      <article className="platform-panel" style={{ maxWidth: '600px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 1.5rem 0', fontSize: '1.25rem' }}>Editar horários</h2>

        {mutation.error instanceof Error && <ErrorState error={mutation.error.message} />}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '1.5rem', maxHeight: '60vh', overflowY: 'auto' }}>
          {[0, 1, 2, 3, 4, 5, 6].map((weekday) => {
            const period = periods.find((p) => p.weekday === weekday);
            return (
              <div key={weekday} style={{ paddingBottom: '1rem', borderBottom: '1px solid #f5f3f0' }}>
                <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 600 }}>{weekdayLabel[weekday]}</h3>
                {period ? (
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <input
                      type="time"
                      value={period.startsAt}
                      onChange={(e) => handleChangeTime(weekday, 'startsAt', e.target.value)}
                      style={{ padding: '0.5rem', border: '1px solid #ede8e1', borderRadius: '6px', fontSize: '0.85rem', flex: 1 }}
                    />
                    <span style={{ fontSize: '0.85rem' }}>até</span>
                    <input
                      type="time"
                      value={period.endsAt}
                      onChange={(e) => handleChangeTime(weekday, 'endsAt', e.target.value)}
                      style={{ padding: '0.5rem', border: '1px solid #ede8e1', borderRadius: '6px', fontSize: '0.85rem', flex: 1 }}
                    />
                    <button
                      onClick={() => handleToggleDayOff(weekday)}
                      className="action-button danger"
                      style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}
                    >
                      Folga
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleChangeTime(weekday, 'startsAt', '09:00')}
                    className="action-button primary"
                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', width: '100%' }}
                  >
                    Adicionar período
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="action-button primary" style={{ flex: 1 }}>
            {mutation.isPending ? 'Salvando...' : 'Salvar'}
          </button>
          <button onClick={onClose} className="action-button secondary" style={{ flex: 1 }} disabled={mutation.isPending}>
            Cancelar
          </button>
        </div>
      </article>
    </div>
  );
}
