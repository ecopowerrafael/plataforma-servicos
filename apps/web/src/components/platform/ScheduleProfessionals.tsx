import { ProfessionalListResponseSchema, ProfessionalScheduleResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { ScheduleProfessionalEditor } from './ScheduleProfessionalEditor.js';

interface Professional {
  publicId: string;
  publicName: string;
}

const weekdayLabel = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

export function ScheduleProfessionals({ tenantPublicId }: { tenantPublicId: string }) {
  const [editingProfessional, setEditingProfessional] = useState<string | null>(null);

  const { data: professionals, isLoading } = useQuery({
    queryKey: ['platform', tenantPublicId, 'professionals'],
    queryFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/professionals?page=1&limit=100`, {
        schema: ProfessionalListResponseSchema,
      }),
  });

  if (isLoading)
    return (
      <article className="platform-panel">
        <p style={{ margin: 0, textAlign: 'center', color: '#99958f' }}>Carregando...</p>
      </article>
    );

  const items = professionals?.items || [];

  if (items.length === 0)
    return (
      <article className="platform-panel">
        <p style={{ margin: 0, textAlign: 'center', color: '#99958f' }}>Nenhum profissional configurado.</p>
      </article>
    );

  if (editingProfessional) {
    return (
      <ScheduleProfessionalEditor
        tenantPublicId={tenantPublicId}
        professionalPublicId={editingProfessional}
        onClose={() => setEditingProfessional(null)}
      />
    );
  }

  return (
    <article className="platform-panel">
      <h2 style={{ margin: '0 0 1.5rem 0', fontSize: '1.125rem' }}>Horários dos profissionais</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {items.map((pro) => (
          <ProfessionalScheduleCard
            key={pro.publicId}
            professional={pro}
            tenantPublicId={tenantPublicId}
            onEdit={() => setEditingProfessional(pro.publicId)}
          />
        ))}
      </div>
    </article>
  );
}

function ProfessionalScheduleCard({
  professional,
  tenantPublicId,
  unitPublicId,
  onEdit,
}: {
  professional: Professional;
  tenantPublicId: string;
  unitPublicId: string;
  onEdit: () => void;
}) {
  const { data: schedule } = useQuery({
    queryKey: ['platform', tenantPublicId, 'professionals', professional.publicId, 'schedule'],
    queryFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/professionals/${professional.publicId}/schedule`, {
        schema: ProfessionalScheduleResponseSchema,
      }),
  });

  const items = schedule?.items || [];
  const byWeekday = new Map<number, typeof items>();
  items.filter((i) => i.active).forEach((item) => {
    const list = byWeekday.get(item.weekday) || [];
    list.push(item);
    byWeekday.set(item.weekday, list);
  });

  return (
    <div style={{ padding: '1rem', backgroundColor: '#faf8f5', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div style={{ flex: 1 }}>
        <p style={{ margin: '0 0 0.75rem 0', fontWeight: 600, fontSize: '0.95rem' }}>{professional.publicName}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem' }}>
          {[0, 1, 2, 3, 4, 5, 6].map((weekday) => {
            const periods = byWeekday.get(weekday);
            return (
              <div key={weekday} style={{ fontSize: '0.8rem' }}>
                <p style={{ margin: 0, fontWeight: 500, color: '#57534e' }}>{weekdayLabel[weekday]}</p>
                {periods && periods.length > 0 ? (
                  periods.map((p, idx) => (
                    <p key={idx} style={{ margin: '0.15rem 0', color: '#1c1917' }}>
                      {p.startsAt}–{p.endsAt}
                    </p>
                  ))
                ) : (
                  <p style={{ margin: '0.15rem 0', color: '#b91c1c' }}>Folga</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <button onClick={onEdit} className="action-button primary" style={{ padding: '0.5rem 1rem', marginLeft: '1rem', whiteSpace: 'nowrap' }}>
        Editar
      </button>
    </div>
  );
}
