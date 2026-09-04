import { PlatformTenantDetailResponseSchema, TenantSettingsInputSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';
import { ErrorState } from './PlatformUi.js';

const PRESET_INTERVALS = [10, 15, 30, 60] as const;

export function ScheduleSettings({ tenantPublicId }: { tenantPublicId: string }) {
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [useCustomInterval, setUseCustomInterval] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [formData, setFormData] = useState({
    defaultAppointmentIntervalMinutes: 15,
    minimumAdvanceMinutes: 0,
    maximumAdvanceDays: 180,
    allowMultipleUnits: false,
    weekStartsOn: 'MONDAY' as const,
    timeFormat: '24H' as const,
    timezone: 'America/Sao_Paulo',
    locale: 'pt-BR',
    currency: 'BRL' as const,
  });

  const { data: tenant, isLoading } = useQuery({
    queryKey: ['platform', 'tenant', tenantPublicId, 'settings'],
    queryFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}`, {
        schema: PlatformTenantDetailResponseSchema,
      }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      await httpClient.request(`/platform/tenants/${tenantPublicId}/settings`, {
        method: 'PATCH',
        body: {
          allowMultipleUnits: formData.allowMultipleUnits,
          defaultAppointmentIntervalMinutes: formData.defaultAppointmentIntervalMinutes,
          minimumAdvanceMinutes: formData.minimumAdvanceMinutes,
          maximumAdvanceDays: formData.maximumAdvanceDays,
          weekStartsOn: formData.weekStartsOn,
          dateFormat: tenant?.settings.dateFormat ?? 'DD/MM/YYYY',
          timeFormat: formData.timeFormat,
        },
        schema: PlatformTenantDetailResponseSchema,
      });
      return httpClient.request(`/platform/tenants/${tenantPublicId}`, {
        method: 'PATCH',
        body: {
          timezone: formData.timezone,
          locale: formData.locale,
          currency: formData.currency,
        },
        schema: PlatformTenantDetailResponseSchema,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'tenant', tenantPublicId, 'settings'] });
      setEditMode(false);
      setSuccessMessage('Configurações de agendamento salvas com sucesso.');
      setTimeout(() => setSuccessMessage(''), 4000);
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
                allowMultipleUnits: settings.allowMultipleUnits,
                weekStartsOn: settings.weekStartsOn,
                timeFormat: settings.timeFormat,
                timezone: tenant?.timezone ?? 'America/Sao_Paulo',
                locale: tenant?.locale ?? 'pt-BR',
                currency: tenant?.currency ?? 'BRL',
              });
              setUseCustomInterval(!PRESET_INTERVALS.includes(settings.defaultAppointmentIntervalMinutes as any));
              setSuccessMessage('');
              updateMutation.reset();
              setEditMode(true);
            }}
            className="action-button primary"
            style={{ padding: '0.5rem 1rem' }}
          >
            Editar
          </button>
        )}
      </div>

      {(updateMutation.error instanceof Error) && <ErrorState message={updateMutation.error.message} />}
      {successMessage && (
        <div style={{ padding: '1rem', backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', color: '#15803d', marginBottom: '1rem', fontSize: '0.9rem' }}>
          {successMessage}
        </div>
      )}

      {editMode ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontWeight: 600, fontSize: '0.78rem', marginBottom: '0.75rem' }}>
              Intervalo da agenda *
              <p style={{ margin: '0', fontSize: '0.75rem', color: '#99958f', fontWeight: 400 }}>Define de quanto em quanto tempo os horários são organizados (08:00, 08:15, 08:30...)</p>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
              {PRESET_INTERVALS.map((interval) => (
                <button
                  key={interval}
                  type="button"
                  onClick={() => {
                    setFormData({ ...formData, defaultAppointmentIntervalMinutes: interval });
                    setUseCustomInterval(false);
                  }}
                  style={{
                    padding: '0.65rem',
                    border: formData.defaultAppointmentIntervalMinutes === interval && !useCustomInterval ? '2px solid #c5a059' : '1px solid #ede8e1',
                    borderRadius: '6px',
                    backgroundColor: formData.defaultAppointmentIntervalMinutes === interval && !useCustomInterval ? '#faf5eb' : '#ffffff',
                    color: formData.defaultAppointmentIntervalMinutes === interval && !useCustomInterval ? '#996515' : '#57534e',
                    fontWeight: formData.defaultAppointmentIntervalMinutes === interval && !useCustomInterval ? 600 : 400,
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                  }}
                >
                  {interval} min
                </button>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={useCustomInterval}
                onChange={(e) => {
                  setUseCustomInterval(e.target.checked);
                  if (!e.target.checked) setFormData({ ...formData, defaultAppointmentIntervalMinutes: 15 });
                }}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Personalizado</span>
            </label>
            {useCustomInterval && (
              <div style={{ marginTop: '0.5rem' }}>
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={formData.defaultAppointmentIntervalMinutes}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (!Number.isNaN(value)) setFormData({ ...formData, defaultAppointmentIntervalMinutes: value });
                  }}
                  placeholder="Digite os minutos"
                  style={{ padding: '0.65rem 0.85rem', border: '1px solid #ede8e1', borderRadius: '6px', fontSize: '0.88rem', width: '100%', boxSizing: 'border-box' }}
                />
                <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.75rem', color: '#99958f' }}>Valor entre 5 e 120 minutos</p>
              </div>
            )}
          </div>

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

          <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px solid #ede8e1' }} />

          <h3 style={{ margin: '0.5rem 0 1rem 0', fontSize: '0.9rem', fontWeight: 600 }}>Preferências de Calendário</h3>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>Início da semana *</span>
            <select
              value={formData.weekStartsOn}
              onChange={(e) => setFormData({ ...formData, weekStartsOn: e.target.value as any })}
              style={{ padding: '0.65rem 0.85rem', border: '1px solid #ede8e1', borderRadius: '10px', fontSize: '0.88rem' }}
            >
              <option value="SUNDAY">Domingo</option>
              <option value="MONDAY">Segunda-feira</option>
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>Formato de hora *</span>
            <select
              value={formData.timeFormat}
              onChange={(e) => setFormData({ ...formData, timeFormat: e.target.value as any })}
              style={{ padding: '0.65rem 0.85rem', border: '1px solid #ede8e1', borderRadius: '10px', fontSize: '0.88rem' }}
            >
              <option value="24H">24 horas</option>
              <option value="12H">12 horas (AM/PM)</option>
            </select>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1rem' }}>
            <input
              type="checkbox"
              checked={formData.allowMultipleUnits}
              onChange={(e) => setFormData({ ...formData, allowMultipleUnits: e.target.checked })}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>Permitir múltiplas unidades</span>
          </label>
          <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.75rem', color: '#99958f' }}>Habilita gerenciamento de múltiplas filiais/unidades</p>

          <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px solid #ede8e1' }} />

          <h3 style={{ margin: '0.5rem 0 1rem 0', fontSize: '0.9rem', fontWeight: 600 }}>Preferências Regionais</h3>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>Fuso horário *</span>
            <input
              type="text"
              value={formData.timezone}
              onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
              placeholder="America/Sao_Paulo"
              style={{ padding: '0.65rem 0.85rem', border: '1px solid #ede8e1', borderRadius: '10px', fontSize: '0.88rem' }}
            />
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#99958f' }}>Identificador IANA (ex: America/Sao_Paulo, America/New_York)</p>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>Localidade *</span>
            <input
              type="text"
              value={formData.locale}
              onChange={(e) => setFormData({ ...formData, locale: e.target.value })}
              placeholder="pt-BR"
              style={{ padding: '0.65rem 0.85rem', border: '1px solid #ede8e1', borderRadius: '10px', fontSize: '0.88rem' }}
            />
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#99958f' }}>Código de idioma/região (ex: pt-BR, en-US, es-ES)</p>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>Moeda *</span>
            <select
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value as any })}
              style={{ padding: '0.65rem 0.85rem', border: '1px solid #ede8e1', borderRadius: '10px', fontSize: '0.88rem' }}
            >
              <option value="BRL">BRL - Real Brasileiro</option>
              <option value="USD">USD - Dólar Americano</option>
              <option value="EUR">EUR - Euro</option>
            </select>
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

          <div style={{ margin: '1.5rem 0 0 0', padding: '1.5rem 0', borderTop: '1px solid #ede8e1' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', fontWeight: 600 }}>Preferências de Calendário</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
              <div style={{ padding: '1rem', backgroundColor: '#faf8f5', borderRadius: '10px' }}>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#57534e', fontWeight: 600 }}>Início da semana</p>
                <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#1c1917' }}>
                  {displaySettings.weekStartsOn === 'SUNDAY' ? 'Domingo' : 'Segunda-feira'}
                </p>
              </div>
              <div style={{ padding: '1rem', backgroundColor: '#faf8f5', borderRadius: '10px' }}>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#57534e', fontWeight: 600 }}>Formato de hora</p>
                <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#1c1917' }}>
                  {displaySettings.timeFormat === '24H' ? '24 horas' : '12 horas (AM/PM)'}
                </p>
              </div>
              <div style={{ padding: '1rem', backgroundColor: '#faf8f5', borderRadius: '10px' }}>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#57534e', fontWeight: 600 }}>Múltiplas unidades</p>
                <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: displaySettings.allowMultipleUnits ? '#047857' : '#b91c1c' }}>
                  {displaySettings.allowMultipleUnits ? '✓ Habilitado' : '✗ Desabilitado'}
                </p>
              </div>
            </div>
          </div>

          <div style={{ margin: '1.5rem 0 0 0', padding: '1.5rem 0', borderTop: '1px solid #ede8e1' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', fontWeight: 600 }}>Preferências Regionais</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
              <div style={{ padding: '1rem', backgroundColor: '#faf8f5', borderRadius: '10px' }}>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#57534e', fontWeight: 600 }}>Fuso horário</p>
                <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#1c1917' }}>{tenant?.timezone}</p>
              </div>
              <div style={{ padding: '1rem', backgroundColor: '#faf8f5', borderRadius: '10px' }}>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#57534e', fontWeight: 600 }}>Localidade</p>
                <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#1c1917' }}>{tenant?.locale}</p>
              </div>
              <div style={{ padding: '1rem', backgroundColor: '#faf8f5', borderRadius: '10px' }}>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#57534e', fontWeight: 600 }}>Moeda</p>
                <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#1c1917' }}>{tenant?.currency}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
