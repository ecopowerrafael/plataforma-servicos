import { useQuery } from '@tanstack/react-query';
import { TenantInfoSchema } from '@plataforma/shared';
import { httpClient } from '../../../lib/http.js';
import { PageHeader } from '../../ui/AppUi.js';
import '../bot-cobra.css';

export function BotCobraSettingsSection({ tenantPublicId }: { tenantPublicId: string }) {
  const { data: tenant, isLoading } = useQuery({
    queryKey: ['bot-cobra-settings', tenantPublicId],
    queryFn: () =>
      httpClient.request('/tenant/info', {
        method: 'GET',
        schema: TenantInfoSchema,
        tenantPublicId,
      }),
  });

  return (
    <div className="app-shell bot-cobra-page">
      <div className="bot-cobra-container">
        <PageHeader title="Configurações" description="Gerenciar comportamento e integrações do Bot Cobra" />

        {isLoading ? (
          <div className="bot-cobra-settings-grid">
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ height: '140px', background: '#f1f5f9', borderRadius: 'var(--app-radius-lg)' }} />
            ))}
          </div>
        ) : tenant ? (
          <div className="bot-cobra-settings-grid">
            {/* Bot Cobra */}
            <div className="bot-cobra-settings-card">
              <h3>Bot Cobra</h3>
              <p>Controla se novas cobranças automáticas podem ser processadas</p>
              <span className={`bot-cobra-badge ${tenant.botCobraEnabled ? 'open' : 'paused'}`}>
                {tenant.botCobraEnabled ? 'Ativo' : 'Inativo'}
              </span>
            </div>

            {/* WhatsApp */}
            <div className="bot-cobra-settings-card">
              <h3>WhatsApp</h3>
              <p>Integração para enviar mensagens e receber respostas</p>
              <span className={`bot-cobra-badge ${tenant.whatsappEnabled ? 'open' : 'paused'}`}>
                {tenant.whatsappEnabled ? 'Conectado' : 'Desconectado'}
              </span>
            </div>

            {/* Timezone */}
            <div className="bot-cobra-settings-card">
              <h3>Fuso Horário</h3>
              <p>Usado para calcular os horários das campanhas</p>
              <div style={{
                background: 'var(--app-surface-subtle)',
                padding: '0.75rem',
                borderRadius: 'var(--app-radius-sm)',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                marginTop: '0.75rem',
              }}>
                {tenant.timezone}
              </div>
            </div>

            {/* Recursos */}
            <div className="bot-cobra-settings-card">
              <h3>Recursos</h3>
              <p>Funcionalidades disponíveis</p>
              <div style={{ fontSize: '0.85rem', marginTop: '0.75rem', display: 'grid', gap: '0.5rem' }}>
                <span>✓ Cobranças automáticas</span>
                <span>✓ Promessas de pagamento</span>
                <span>✓ PIX dinâmico</span>
                <span>✓ Atendimento humano</span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{
            background: 'var(--app-surface-subtle)',
            border: '1px solid var(--app-border)',
            padding: '2rem',
            borderRadius: 'var(--app-radius-md)',
            textAlign: 'center',
          }}>
            <p>Não foi possível carregar as configurações.</p>
          </div>
        )}

        {/* Operational Status */}
        {tenant && (
          <div className="bot-cobra-form-section" style={{ marginTop: '2rem' }}>
            <h3>Status Operacional</h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem',
            }}>
              <div>
                <strong style={{ display: 'block', marginBottom: '0.5rem' }}>WhatsApp</strong>
                <div style={{ fontSize: '0.9rem', color: tenant.whatsappEnabled ? 'var(--app-success)' : 'var(--app-muted)' }}>
                  ● {tenant.whatsappEnabled ? 'Conectado' : 'Não configurado'}
                </div>
              </div>
              <div>
                <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Agendador</strong>
                <div style={{ fontSize: '0.9rem', color: 'var(--app-success)' }}>
                  ● Ativo
                </div>
              </div>
              <div>
                <strong style={{ display: 'block', marginBottom: '0.5rem' }}>PIX</strong>
                <div style={{ fontSize: '0.9rem', color: 'var(--app-success)' }}>
                  ● Disponível
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
