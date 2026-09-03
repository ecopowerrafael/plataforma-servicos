import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { ScheduleUnitHours } from './ScheduleUnitHours.js';
import { ScheduleProfessionals } from './ScheduleProfessionals.js';
import { ScheduleUnavailability } from './ScheduleUnavailability.js';
import { ScheduleDateOverrides } from './ScheduleDateOverrides.js';
import { ScheduleSettings } from './ScheduleSettings.js';

interface BusinessUnit {
  publicId: string;
  name: string;
  slug: string;
  timezone: string;
}

interface BusinessUnitListResponse {
  items: BusinessUnit[];
}

export function ScheduleModule({ tenantPublicId }: { tenantPublicId: string }) {
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  const { data: units, isLoading: unitsLoading } = useQuery({
    queryKey: ['tenant', tenantPublicId, 'units'],
    queryFn: () =>
      httpClient.request(`/tenant/units`, {
        schema: z.object({ items: z.array(z.object({ publicId: z.string(), name: z.string(), slug: z.string(), timezone: z.string() })) }),
        tenantPublicId,
      }),
  });

  const unitsList = units?.items || [];
  const selectedUnit = unitsList.find((u) => u.publicId === selectedUnitId) || unitsList[0];

  if (unitsLoading)
    return (
      <article className="platform-panel">
        <p style={{ margin: 0, textAlign: 'center', color: '#99958f' }}>Carregando...</p>
      </article>
    );

  if (unitsList.length === 0)
    return (
      <article className="platform-panel">
        <p style={{ margin: 0, textAlign: 'center', color: '#99958f' }}>Nenhuma unidade configurada.</p>
      </article>
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {unitsList.length > 1 && (
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.85rem' }}>
            Unidade
          </label>
          <select
            value={selectedUnitId || selectedUnit?.publicId || ''}
            onChange={(e) => setSelectedUnitId(e.target.value)}
            style={{
              padding: '0.65rem 0.85rem',
              border: '1px solid #ede8e1',
              borderRadius: '10px',
              fontSize: '0.88rem',
              width: '100%',
            }}
          >
            {unitsList.map((unit) => (
              <option key={unit.publicId} value={unit.publicId}>
                {unit.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedUnit && (
        <>
          <ScheduleUnitHours tenantPublicId={tenantPublicId} unitPublicId={selectedUnit.publicId} />
          <ScheduleProfessionals tenantPublicId={tenantPublicId} unitPublicId={selectedUnit.publicId} />
          <ScheduleUnavailability tenantPublicId={tenantPublicId} />
          <ScheduleDateOverrides tenantPublicId={tenantPublicId} unitPublicId={selectedUnit.publicId} />
          <ScheduleSettings tenantPublicId={tenantPublicId} />
        </>
      )}
    </div>
  );
}
