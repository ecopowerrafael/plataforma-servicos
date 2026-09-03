import { PlatformTenantDetailResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';

import { httpClient } from '../../lib/http.js';

export function ScheduleSettings({ tenantPublicId }: { tenantPublicId: string }) {
  const { data: tenant } = useQuery({
    queryKey: ['platform', 'tenant', tenantPublicId, 'settings'],
    queryFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}`, {
        schema: PlatformTenantDetailResponseSchema,
      }),
  });

  if (!tenant)
    return (
      <article className="platform-panel">
        <p style={{ margin: 0, textAlign: 'center', color: '#99958f' }}>Carregando...</p>
      </article>
    );

  const settings = tenant.settings;

  const minAdvanceMinutes = settings.minimumAdvanceMinutes;
  const minAdvanceDays = Math.floor(minAdvanceMinutes / (24 * 60));
  const minAdvanceHours = Math.floor((minAdvanceMinutes % (24 * 60)) / 60);

  const maxAdvanceDays = settings.maximumAdvanceDays;

  return (
    <article className="platform-panel">
      <h2 style={{ margin: '0 0 1.5rem 0', fontSize: '1.125rem' }}>Regras de agendamento</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
        <div style={{ padding: '1rem', backgroundColor: '#faf8f5', borderRadius: '10px' }}>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#57534e', fontWeight: 600 }}>Intervalo da agenda</p>
          <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#1c1917' }}>{settings.defaultAppointmentIntervalMinutes} min</p>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: '#99958f' }}>Duração padrão dos agendamentos</p>
        </div>

        <div style={{ padding: '1rem', backgroundColor: '#faf8f5', borderRadius: '10px' }}>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#57534e', fontWeight: 600 }}>Antecedência mínima</p>
          <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#1c1917' }}>
            {minAdvanceDays > 0 ? `${minAdvanceDays}d` : ''} {minAdvanceHours > 0 ? `${minAdvanceHours}h` : ''}
            {minAdvanceMinutes === 0 ? 'Imediato' : ''}
          </p>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: '#99958f' }}>Prazo mínimo antes do agendamento</p>
        </div>

        <div style={{ padding: '1rem', backgroundColor: '#faf8f5', borderRadius: '10px' }}>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#57534e', fontWeight: 600 }}>Antecedência máxima</p>
          <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#1c1917' }}>{maxAdvanceDays} dias</p>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: '#99958f' }}>Até quantos dias no futuro pode agendar</p>
        </div>
      </div>
    </article>
  );
}
