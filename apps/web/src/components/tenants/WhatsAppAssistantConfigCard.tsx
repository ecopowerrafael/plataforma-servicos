import {
  WhatsAppAssistantConfigResponseSchema,
  SuccessResponseSchema,
  type WhatsAppAssistantConfig,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { httpClient } from '../../lib/http.js';

const FRIENDLY_ACTION_IDS: Record<string, string> = {
  MAIN_MENU_BOOK: 'Agendamento',
  MAIN_MENU_QUERY: 'Consultar agendamento',
  MAIN_MENU_RESCHEDULE: 'Reagendamento',
  MAIN_MENU_CANCEL: 'Cancelamento',
  MAIN_MENU_OTHER: 'Outros assuntos',
};

export function WhatsAppAssistantConfigCard({
  tenantPublicId,
  canManage,
  whatsappConnected,
}: {
  tenantPublicId: string;
  canManage: boolean;
  whatsappConnected: boolean;
}) {
  const client = useQueryClient();
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [previewMode, setPreviewMode] = useState<'new' | 'returning'>('new');
  const queryKey = ['tenant', tenantPublicId, 'whatsapp-assistant-config'];

  const configQuery = useQuery({
    queryKey,
    queryFn: () =>
      httpClient.request('/tenant/integrations/whatsapp/assistant-config', {
        schema: WhatsAppAssistantConfigResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const [formData, setFormData] = useState<WhatsAppAssistantConfig | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize form when data loads
  if (configQuery.data && !formData) {
    setFormData(configQuery.data.config);
  }

  const updateConfig = useMutation({
    mutationFn: (config: WhatsAppAssistantConfig) =>
      httpClient.request('/tenant/integrations/whatsapp/assistant-config', {
        method: 'PATCH',
        body: config,
        schema: SuccessResponseSchema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      setNotice({ type: 'success', message: 'Configuração salva.' });
      setHasChanges(false);
      await client.invalidateQueries({ queryKey });
      setTimeout(() => setNotice(null), 3000);
    },
    onError: () => {
      setNotice({
        type: 'error',
        message: 'Não foi possível salvar a configuração.',
      });
    },
  });

  const restoreConfig = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/integrations/whatsapp/assistant-config/restore', {
        method: 'POST',
        schema: SuccessResponseSchema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      setNotice({ type: 'success', message: 'Configuração restaurada.' });
      setHasChanges(false);
      await client.invalidateQueries({ queryKey });
      setTimeout(() => setNotice(null), 3000);
    },
    onError: () => {
      setNotice({
        type: 'error',
        message: 'Não foi possível restaurar a configuração padrão.',
      });
    },
  });

  const handleGreetingToggle = () => {
    if (!formData) return;
    setFormData({
      ...formData,
      greeting: { ...formData.greeting, enabled: !formData.greeting.enabled },
    });
    setHasChanges(true);
  };

  const handleGreetingBodyChange = (type: 'new' | 'returning', value: string) => {
    if (!formData) return;
    const key = type === 'new' ? 'newCustomerBody' : 'returningCustomerBody';
    setFormData({
      ...formData,
      greeting: { ...formData.greeting, [key]: value },
    });
    setHasChanges(true);
  };

  const handleButtonToggle = (index: number) => {
    if (!formData) return;
    const buttons = [...formData.menu.buttons];
    const enabledCount = buttons.filter((b) => b.enabled).length;

    // Prevent disabling last enabled button
    if (buttons[index]?.enabled && enabledCount === 1) {
      setNotice({
        type: 'error',
        message: 'O menu precisa ter pelo menos uma opção ativa.',
      });
      return;
    }

    buttons[index]!.enabled = !buttons[index]!.enabled;
    setFormData({ ...formData, menu: { buttons } });
    setHasChanges(true);
  };

  const handleButtonLabelChange = (index: number, label: string) => {
    if (!formData) return;
    const buttons = [...formData.menu.buttons];
    buttons[index]!.label = label;
    setFormData({ ...formData, menu: { buttons } });
    setHasChanges(true);
  };

  const handleButtonMove = (index: number, direction: 'up' | 'down') => {
    if (!formData) return;
    const buttons = [...formData.menu.buttons];
    const newIndex = direction === 'up' ? index - 1 : index + 1;

    if (newIndex < 0 || newIndex >= buttons.length) return;

    // Swap and normalize order
    [buttons[index], buttons[newIndex]] = [buttons[newIndex]!, buttons[index]!];
    buttons.forEach((btn, i) => {
      btn.order = i + 1;
    });

    setFormData({ ...formData, menu: { buttons } });
    setHasChanges(true);
  };

  const handleInsertVariable = (variable: string, fieldType?: 'new' | 'returning') => {
    // Insert variable into cursor position
    if (fieldType) {
      const textarea = document.querySelector(
        `textarea[data-field="${fieldType}"]`
      ) as HTMLTextAreaElement;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = fieldType === 'new'
          ? formData?.greeting.newCustomerBody || ''
          : formData?.greeting.returningCustomerBody || '';
        const newText = text.substring(0, start) + variable + text.substring(end);
        handleGreetingBodyChange(fieldType, newText);
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start + variable.length, start + variable.length);
        }, 0);
      }
    }
  };

  if (configQuery.isLoading) {
    return (
      <div className="card">
        <div className="card-header">
          <h2>Atendimento automático</h2>
        </div>
        <div className="card-body">
          <p style={{ color: 'var(--color-text-secondary)' }}>Carregando...</p>
        </div>
      </div>
    );
  }

  if (configQuery.isError || !formData) {
    return (
      <div className="card">
        <div className="card-header">
          <h2>Atendimento automático</h2>
        </div>
        <div className="card-body">
          <p style={{ color: 'var(--color-text-secondary)' }}>
            Não foi possível carregar a configuração do atendimento automático.
          </p>
          <button onClick={() => configQuery.refetch()}>Tentar novamente</button>
        </div>
      </div>
    );
  }

  const enabledButtonCount = formData.menu.buttons.filter((b) => b.enabled).length;
  const currentConfig = configQuery.data;
  const isCustomized = currentConfig?.isCustomized ?? false;

  // Render preview
  const previewTemplate = previewMode === 'new'
    ? formData.greeting.newCustomerBody
    : formData.greeting.returningCustomerBody;

  const previewMessage = formData.greeting.enabled
    ? previewTemplate
      .replace(/\{\{tenantName\}\}/g, 'Seu Negócio')
      .replace(/\{\{customerName\}\}/g, previewMode === 'returning' ? 'João' : '')
    : 'Escolha uma das opções abaixo para continuar.';

  const enabledButtons = formData.menu.buttons
    .filter((b) => b.enabled)
    .sort((a, b) => a.order - b.order);

  return (
    <div className="card">
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2>Mensagem inicial e menu</h2>
          {isCustomized && (
            <span style={{
              fontSize: '12px',
              padding: '4px 8px',
              backgroundColor: 'var(--color-background-secondary)',
              borderRadius: '4px',
              color: 'var(--color-text-secondary)',
            }}>
              Personalizado
            </span>
          )}
        </div>
        <p style={{ color: 'var(--color-text-secondary)', margin: '8px 0 0 0' }}>
          Configure como o assistente recebe seus clientes e quais opções aparecem no início da conversa.
        </p>
      </div>

      <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '24px' }}>
        {/* Left: Form */}
        <div style={{ minWidth: '400px' }}>
          {/* Greeting Toggle */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={formData.greeting.enabled}
                onChange={handleGreetingToggle}
                disabled={!canManage}
              />
              <span>Enviar saudação ao iniciar uma conversa</span>
            </label>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '12px', margin: '8px 0 0 0' }}>
              Quando desativada, o cliente ainda recebe o menu principal.
            </p>
          </div>

          {/* Greeting Messages */}
          {formData.greeting.enabled && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label>Mensagem para novo contato</label>
                <textarea
                  data-field="new"
                  value={formData.greeting.newCustomerBody}
                  onChange={(e) => handleGreetingBodyChange('new', e.target.value)}
                  disabled={!canManage}
                  style={{ width: '100%', minHeight: '80px', marginTop: '8px' }}
                />
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button
                    onClick={() => handleInsertVariable('{{tenantName}}', 'new')}
                    disabled={!canManage}
                    style={{ fontSize: '12px', padding: '4px 8px' }}
                  >
                    [Estabelecimento]
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label>Mensagem para cliente já cadastrado</label>
                <textarea
                  data-field="returning"
                  value={formData.greeting.returningCustomerBody}
                  onChange={(e) => handleGreetingBodyChange('returning', e.target.value)}
                  disabled={!canManage}
                  style={{ width: '100%', minHeight: '80px', marginTop: '8px' }}
                />
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button
                    onClick={() => handleInsertVariable('{{customerName}}', 'returning')}
                    disabled={!canManage}
                    style={{ fontSize: '12px', padding: '4px 8px' }}
                  >
                    [Cliente]
                  </button>
                  <button
                    onClick={() => handleInsertVariable('{{tenantName}}', 'returning')}
                    disabled={!canManage}
                    style={{ fontSize: '12px', padding: '4px 8px' }}
                  >
                    [Estabelecimento]
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Menu Configuration */}
          <div style={{ marginBottom: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
            <h3>Menu principal</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '12px', marginBottom: '12px' }}>
              Escolha quais opções o assistente apresenta no início da conversa.
            </p>

            {formData.menu.buttons.map((button, index) => (
              <div
                key={button.actionId}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '24px 1fr 120px 40px',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '12px',
                  paddingBottom: '12px',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <input
                  type="checkbox"
                  checked={button.enabled}
                  onChange={() => handleButtonToggle(index)}
                  disabled={!canManage}
                />
                <input
                  type="text"
                  value={button.label}
                  onChange={(e) => handleButtonLabelChange(index, e.target.value)}
                  disabled={!canManage}
                  placeholder={FRIENDLY_ACTION_IDS[button.actionId]}
                  style={{ fontSize: '14px' }}
                />
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  {FRIENDLY_ACTION_IDS[button.actionId]}
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={() => handleButtonMove(index, 'up')}
                    disabled={!canManage || index === 0}
                    style={{ padding: '4px 6px', fontSize: '12px' }}
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => handleButtonMove(index, 'down')}
                    disabled={!canManage || index === formData.menu.buttons.length - 1}
                    style={{ padding: '4px 6px', fontSize: '12px' }}
                  >
                    ↓
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Notice */}
          {notice && (
            <div
              style={{
                padding: '12px',
                marginBottom: '16px',
                borderRadius: '4px',
                backgroundColor:
                  notice.type === 'success'
                    ? 'var(--color-background-success)'
                    : 'var(--color-background-error)',
                color: notice.type === 'success'
                  ? 'var(--color-text-success)'
                  : 'var(--color-text-error)',
                fontSize: '12px',
              }}
            >
              {notice.message}
            </div>
          )}

          {/* Action Buttons */}
          {canManage && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button
                onClick={() => updateConfig.mutate(formData)}
                disabled={!hasChanges || updateConfig.isPending}
                style={{ cursor: hasChanges ? 'pointer' : 'not-allowed', opacity: hasChanges ? 1 : 0.5 }}
              >
                {updateConfig.isPending ? 'Salvando...' : 'Salvar alterações'}
              </button>
              {isCustomized && (
                <button
                  onClick={() => {
                    if (confirm('Restaurar a configuração padrão do atendimento automático? Suas mensagens e personalizações do menu serão removidas.')) {
                      restoreConfig.mutate();
                    }
                  }}
                  disabled={restoreConfig.isPending}
                  style={{ backgroundColor: 'transparent', color: 'var(--color-text)' }}
                >
                  {restoreConfig.isPending ? 'Restaurando...' : 'Restaurar padrão'}
                </button>
              )}
            </div>
          )}

          {!whatsappConnected && (
            <div style={{
              padding: '12px',
              marginTop: '16px',
              backgroundColor: 'var(--color-background-secondary)',
              borderRadius: '4px',
              fontSize: '12px',
              color: 'var(--color-text-secondary)',
            }}>
              Você pode preparar o atendimento agora. As mensagens serão utilizadas quando o WhatsApp estiver conectado.
            </div>
          )}
        </div>

        {/* Right: Preview */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          minWidth: '280px',
        }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
              Prévia:
              <select
                value={previewMode}
                onChange={(e) => setPreviewMode(e.target.value as 'new' | 'returning')}
                style={{ marginLeft: '8px', padding: '4px 8px' }}
              >
                <option value="new">Novo contato</option>
                <option value="returning">Cliente cadastrado</option>
              </select>
            </label>
          </div>

          {/* WhatsApp-like Preview */}
          <div
            style={{
              flex: 1,
              backgroundColor: 'var(--color-background-secondary)',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              minHeight: '300px',
            }}
          >
            <div
              style={{
                alignSelf: 'flex-start',
                maxWidth: '80%',
                backgroundColor: '#e5e5ea',
                color: '#000',
                padding: '8px 12px',
                borderRadius: '12px',
                fontSize: '14px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {previewMessage}
            </div>

            {/* Menu Buttons Preview */}
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {enabledButtons.map((button) => (
                <div
                  key={button.actionId}
                  style={{
                    backgroundColor: '#0084ff',
                    color: '#fff',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    textAlign: 'center',
                    opacity: button.enabled ? 1 : 0.5,
                  }}
                >
                  {button.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
