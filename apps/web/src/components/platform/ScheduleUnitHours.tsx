import { BusinessUnitOperatingHoursResponseSchema, ReplaceBusinessUnitOperatingHoursRequestSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { ErrorState } from './PlatformUi.js';

const weekdayLabel = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

interface OperatingHoursPeriod {
  publicId: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
}

export function ScheduleUnitHours({ tenantPublicId, unitPublicId }: { tenantPublicId: string; unitPublicId: string }) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [periods, setPeriods] = useState<OperatingHoursPeriod[]>([]);

  const { data: hours, isLoading } = useQuery({
    queryKey: ['platform', tenantPublicId, 'units', unitPublicId, 'operating-hours'],
    queryFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/units/${unitPublicId}/operating-hours`, {
        schema: BusinessUnitOperatingHoursResponseSchema,
      }),
    onSuccess: (data) => setPeriods(data.items),
  });

  const mutation = useMutation({
    mutationFn: (newPeriods: typeof periods) =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/units/${unitPublicId}/operating-hours`, {
        method: 'PUT',
        body: { periods: newPeriods.map((p) => ({ weekday: p.weekday, startsAt: p.startsAt, endsAt: p.endsAt, active: p.active })) },
        schema: BusinessUnitOperatingHoursResponseSchema,
      }),
    onSuccess: (data) => {
      setPeriods(data.items);
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['platform', tenantPublicId, 'units', unitPublicId, 'operating-hours'] });
    },
  });

  const handleSave = () => {
    mutation.mutate(periods);
  };

  const handleChangePeriod = (index: number, field: string, value: any) => {
    const updated = [...periods];
    updated[index] = { ...updated[index], [field]: value };
    setPeriods(updated);
  };

  const handleAddPeriod = (weekday: number) => {
    setPeriods([...periods, { publicId: '', weekday, startsAt: '09:00', endsAt: '18:00', active: true }]);
  };

  const handleRemovePeriod = (index: number) => {
    setPeriods(periods.filter((_, i) => i !== index));
  };

  if (isLoading)
    return (
      <article className="platform-panel">
        <p style={{ margin: 0, textAlign: 'center', color: '#99958f' }}>Carregando...</p>
      </article>
    );

  const byWeekday = new Map<number, OperatingHoursPeriod[]>();
  periods.forEach((p) => {
    const list = byWeekday.get(p.weekday) || [];
    list.push(p);
    byWeekday.set(p.weekday, list);
  });

  return (
    <article className="platform-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.125rem' }}>Horário de funcionamento</h2>
        {!isEditing && (
          <button onClick={() => setIsEditing(true)} className="action-button secondary" style={{ padding: '0.5rem 1rem' }}>
            Editar
          </button>
        )}
      </div>

      {mutation.error instanceof Error && <ErrorState error={mutation.error.message} />}

      {isEditing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {[0, 1, 2, 3, 4, 5, 6].map((weekday) => (
            <div key={weekday} style={{ borderBottom: '1px solid #f5f3f0', paddingBottom: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', fontWeight: 600 }}>{weekdayLabel[weekday]}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {byWeekday.get(weekday)?.map((period, idx) => {
                  const globalIdx = periods.findIndex((p) => p === period);
                  return (
                    <div key={idx} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <input
                        type="time"
                        value={period.startsAt}
                        onChange={(e) => handleChangePeriod(globalIdx, 'startsAt', e.target.value)}
                        style={{ padding: '0.5rem', border: '1px solid #ede8e1', borderRadius: '6px', fontSize: '0.85rem', flex: 1 }}
                      />
                      <span style={{ fontSize: '0.85rem' }}>até</span>
                      <input
                        type="time"
                        value={period.endsAt}
                        onChange={(e) => handleChangePeriod(globalIdx, 'endsAt', e.target.value)}
                        style={{ padding: '0.5rem', border: '1px solid #ede8e1', borderRadius: '6px', fontSize: '0.85rem', flex: 1 }}
                      />
                      <button
                        onClick={() => handleRemovePeriod(globalIdx)}
                        className="action-button danger"
                        style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                }) || <p style={{ margin: 0, fontSize: '0.85rem', color: '#99958f' }}>Dia fechado</p>}
                {!byWeekday.has(weekday) && (
                  <button
                    onClick={() => handleAddPeriod(weekday)}
                    className="action-button primary"
                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                  >
                    + Adicionar período
                  </button>
                )}
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={handleSave}
              disabled={mutation.isPending}
              className="action-button primary"
              style={{ flex: 1 }}
            >
              {mutation.isPending ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setPeriods(hours?.items || []);
              }}
              className="action-button secondary"
              style={{ flex: 1 }}
              disabled={mutation.isPending}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          {[0, 1, 2, 3, 4, 5, 6].map((weekday) => (
            <div key={weekday} style={{ padding: '1rem', backgroundColor: '#faf8f5', borderRadius: '10px' }}>
              <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600, fontSize: '0.9rem' }}>{weekdayLabel[weekday]}</p>
              {byWeekday.get(weekday)?.map((period, idx) => (
                <p key={idx} style={{ margin: '0.25rem 0', fontSize: '0.85rem', color: '#57534e' }}>
                  {period.startsAt} — {period.endsAt}
                </p>
              )) || <p style={{ margin: 0, fontSize: '0.85rem', color: '#b91c1c' }}>Fechado</p>}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
