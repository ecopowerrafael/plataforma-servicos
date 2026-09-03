import { PlatformTenantDetailResponseSchema, TenantSettingsInputSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';
import { ErrorState } from './PlatformUi.js';

export function ScheduleSettings({ tenantPublicId }: { tenantPublicId: string }) {
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    defaultAppointmentIntervalMinutes: 15,
    minimumAdvanceMinutes: 0,
    maximumAdvanceDays: 180,
  });

  const { data: tenant, isLoading } = useQuery({
    queryKey: ['platform', 'tenant', tenantPublicId, 'settings'],
    queryFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}`, {
        schema: PlatformTenantDetailResponseSchema,
      }),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/settings`, {
        method: 'PATCH',
        body: {
          allowMultipleUnits: tenant?.settings.allowMultipleUnits ?? false,
          defaultAppointmentIntervalMinutes: formData.defaultAppointmentIntervalMinutes,
          minimumAdvanceMinutes: formData.minimumAdvanceMinutes,
          maximumAdvanceDays: formData.maximumAdvanceDays,
          weekStartsOn: tenant?.settings.weekStartsOn ?? 'MONDAY',
          dateFormat: tenant?.settings.dateFormat ?? 'DD/MM/YYYY',
          timeFormat: tenant?.settings.timeFormat ?? '24H',
        },
        schema: PlatformTenantDetailResponseSchema,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'tenant', tenantPublicId, 'settings'] });
      setEditMode(false);
    },
  });

  if (isLoading)
    return (
      <article className="platform-panel">
        <p style={{ margin: 0, textAlign: 'center', color: '#99958f' }}>Carregando...</p>
      </article>
    );

  if (!tenant) return null;

  const settings = tenant.settings;
  const displaySettings = editMode ? formData : settings;

  const minAdvanceMinutes = displaySettings.minimumAdvanceMinutes;
  const minAdvanceDays = Math.floor(minAdvanceMinutes / (24 * 60));
  const minAdvanceHours = Math.floor((minAdvanceMinutes % (24 * 60)) / 60);

  return (
    <article className="platform-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.125rem' }}>Regras de agendamento</h2>
        {!editMode && (
          <button
            onClick={() => {
              setFormData({
                defaultAppointmentIntervalMinutes: settings.defaultAppointmentIntervalMinutes,
                minimumAdvanceMinutes: settings.minimumAdvanceMinutes,
                maximumAdvanceDays: settings.maximumAdvanceDays,
              });
              setEditMode(true);
            }}
            className="action-button primary"
            style={{ padding: '0.5rem 1rem' }}
          >
            Editar
          </button>
        )}
      </div>

      {(updateMutation.error instanceof Error) && <ErrorState error={updateMutation.error.message} />}

      {editMode ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>Intervalo da agenda (minutos) *</span>
            <input
              type="number"
              min={5}
              max={120}
              step={5}
              value={formData.defaultAppointmentIntervalMinutes}
              onChange={(e) => setFormData({ ...formData, defaultAppointmentIntervalMinutes: parseInt(e.target.value, 10) })}
              style={{ padding: '0.65rem 0.85rem', border: '1px solid #ede8e1', borderRadius: '10px', fontSize: '0.88rem' }}
            />
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#99958f' }}>Duração padrão dos agendamentos</p>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>Antecedência mínima (minutos) *</span>
            <input
              type="number"
              min={0}
              max={43200}
              step={60}
              value={formData.minimumAdvanceMinutes}
              onChange={(e) => setFormData({ ...formData, minimumAdvanceMinutes: parseInt(e.target.value, 10) })}
              style={{ padding: '0.65rem 0.85rem', border: '1px solid #ede8e1', borderRadius: '10px', fontSize: '0.88rem' }}
            />
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#99958f' }}>Prazo mínimo antes do agendamento (0 = imediato)</p>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>Antecedência máxima (dias) *</span>
            <input
              type="number"
              min={1}
              max={365}
              value={formData.maximumAdvanceDays}
              onChange={(e) => setFormData({ ...formData, maximumAdvanceDays: parseInt(e.target.value, 10) })}
              style={{ padding: '0.65rem 0.85rem', border: '1px solid #ede8e1', borderRadius: '10px', fontSize: '0.88rem' }}
            />
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#99958f' }}>Até quantos dias no futuro pode agendar</p>
          </label>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="action-button primary" style={{ flex: 1 }}>
              {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
            </button>
            <button onClick={() => setEditMode(false)} className="action-button secondary" style={{ flex: 1 }} disabled={updateMutation.isPending}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
          <div style={{ padding: '1rem', backgroundColor: '#faf8f5', borderRadius: '10px' }}>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#57534e', fontWeight: 600 }}>Intervalo da agenda</p>
            <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#1c1917' }}>{displaySettings.defaultAppointmentIntervalMinutes} min</p>
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
            <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#1c1917' }}>{displaySettings.maximumAdvanceDays} dias</p>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: '#99958f' }}>Até quantos dias no futuro pode agendar</p>
          </div>
        </div>
      )}
    </article>
  );
}
