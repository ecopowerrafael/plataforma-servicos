import {
  WhatsAppMessagesListResponseSchema,
  WhatsAppReminderConfigSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';
import { WhatsAppMessageEditor } from './WhatsAppMessageEditor.js';

const FRIENDLY_TITLES: Record<string, { title: string; description: string }> = {
  'appointment.booking_confirmed': {
    title: 'Confirmação de agendamento',
    description: 'Enviada imediatamente quando um novo agendamento é realizado.',
  },
  'appointment.day_before_reminder': {
    title: 'Lembrete do dia anterior',
    description: 'Enviada no dia anterior ao atendimento, no horário configurado.',
  },
  'appointment.upcoming_reminder': {
    title: 'Lembrete antes do atendimento',
    description: 'Enviada alguns minutos antes do horário marcado.',
  },
  'appointment.booking_canceled': {
    title: 'Cancelamento de agendamento',
    description: 'Enviada quando um agendamento é cancelado.',
  },
};

export function WhatsAppMessagesCard({
  tenantPublicId,
  canManage,
  whatsappConnected,
}: {
  tenantPublicId: string;
  canManage: boolean;
  whatsappConnected: boolean;
}) {
  const client = useQueryClient();
  const [expandedKind, setExpandedKind] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const messageQueryKey = ['tenant', tenantPublicId, 'whatsapp-messages'];
  const reminderQueryKey = ['tenant', tenantPublicId, 'whatsapp-reminder-config'];

  const messages = useQuery({
    queryKey: messageQueryKey,
    queryFn: () =>
      httpClient.request('/tenant/integrations/whatsapp/messages', {
        schema: WhatsAppMessagesListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const reminderConfig = useQuery({
    queryKey: reminderQueryKey,
    queryFn: () =>
      httpClient.request('/tenant/integrations/whatsapp/reminder-config', {
        schema: WhatsAppReminderConfigSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const refresh = async () => {
    await client.invalidateQueries({ queryKey: messageQueryKey });
    await client.invalidateQueries({ queryKey: reminderQueryKey });
  };

  type MessageItem = (typeof messages.data)['items'][number];

  const updateMessage = useMutation({
    mutationFn: (input: { kind: string; payload: Record<string, unknown> }) =>
      httpClient.request(`/tenant/integrations/whatsapp/messages/${input.kind}`, {
        method: 'PATCH',
        body: input.payload,
        schema: WhatsAppMessagesListResponseSchema.shape.items.element,
        tenantPublicId,
      }),
    onSuccess: async () => {
      setNotice('Mensagem salva com sucesso.');
      await refresh();
    },
  });

  const updateReminderConfig = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      httpClient.request('/tenant/integrations/whatsapp/reminder-config', {
        method: 'PATCH',
        body: payload,
        schema: WhatsAppReminderConfigSchema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      setNotice('Configuração de lembretes salva com sucesso.');
      await refresh();
    },
  });

  const restoreMessage = useMutation({
    mutationFn: (kind: string) =>
      httpClient.request(`/tenant/integrations/whatsapp/messages/${kind}/restore`, {
        method: 'POST',
        body: {},
        schema: WhatsAppMessagesListResponseSchema.shape.items.element,
        tenantPublicId,
      }),
    onSuccess: async () => {
      setNotice('Padrão restaurado com sucesso.');
      await refresh();
    },
  });

  if (messages.isPending || reminderConfig.isPending) {
    return (
      <fieldset className="whatsapp-messages-card">
        <legend>Mensagens automáticas</legend>
        <div className="module-loading">Carregando mensagens…</div>
      </fieldset>
    );
  }

  if (messages.error instanceof Error || messages.data === undefined) {
    return (
      <fieldset className="whatsapp-messages-card">
        <legend>Mensagens automáticas</legend>
        <div className="area-error-state">
          <p>Não foi possível carregar as mensagens.</p>
          <button
            type="button"
            onClick={() => {
              void refresh();
            }}
          >
            Tentar novamente
          </button>
        </div>
      </fieldset>
    );
  }


  const config = reminderConfig.data;

  return (
    <fieldset className="whatsapp-messages-card">
      <legend>Mensagens automáticas</legend>
      {!whatsappConnected && (
        <div className="ds-form-hint">
          <p>
            ⚠️ Conecte seu WhatsApp para que estas mensagens sejam enviadas automaticamente aos seus
            clientes.
          </p>
        </div>
      )}
      {notice && <p className="success-message">{notice}</p>}
      {messages.data.items.map((message) => {
        const friendly = FRIENDLY_TITLES[message.kind] || { title: message.kind, description: '' };
        return (
          <WhatsAppMessageEditor
            key={message.kind}
            message={{
              ...message,
              title: friendly.title,
              description: friendly.description,
            }}
            isExpanded={expandedKind === message.kind}
            onToggleExpand={(kind) => setExpandedKind(expandedKind === kind ? null : kind)}
            canManage={canManage}
            friendlyTitle={friendly.title}
            friendlyDescription={friendly.description}
            isDayBefore={message.kind === 'appointment.day_before_reminder'}
            isUpcoming={message.kind === 'appointment.upcoming_reminder'}
            reminderConfig={config}
            onSaveMessage={(payload) => updateMessage.mutate({ kind: message.kind, payload })}
            onRestoreMessage={() => restoreMessage.mutate(message.kind)}
            onSaveReminderConfig={(payload) => updateReminderConfig.mutate(payload)}
            isSaving={
              updateMessage.isPending ||
              updateReminderConfig.isPending ||
              restoreMessage.isPending
            }
            error={updateMessage.error || updateReminderConfig.error || restoreMessage.error}
          />
        );
      })}
    </fieldset>
  );
}
