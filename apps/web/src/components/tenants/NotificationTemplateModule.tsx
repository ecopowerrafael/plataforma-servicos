import {
  NotificationTemplateListResponseSchema,
  SuccessResponseSchema,
  type NotificationTemplateEntry,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';

const kindLabels: Record<string, string> = {
  'appointment.booking_confirmed': 'Confirmação de agendamento',
  'appointment.booking_canceled': 'Cancelamento de agendamento',
  'appointment.reminder': 'Lembrete de atendimento',
};

function TemplateEditor({
  entry,
  tenantPublicId,
  canManage,
}: {
  entry: NotificationTemplateEntry;
  tenantPublicId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState(entry.subject);
  const [body, setBody] = useState(entry.body);

  const save = useMutation({
    mutationFn: () =>
      httpClient.request(`/tenant/notification-templates/${entry.kind}`, {
        method: 'PUT',
        body: { subject, body },
        schema: SuccessResponseSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['tenant', tenantPublicId, 'notification-templates'],
      });
    },
  });

  const reset = useMutation({
    mutationFn: () =>
      httpClient.request(`/tenant/notification-templates/${entry.kind}`, {
        method: 'PUT',
        body: { subject: null, body: null },
        schema: SuccessResponseSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['tenant', tenantPublicId, 'notification-templates'],
      });
    },
  });

  return (
    <fieldset disabled={!canManage}>
      <legend>
        {kindLabels[entry.kind] ?? entry.kind}
        {entry.isCustom ? ' (personalizado)' : ' (padrão)'}
      </legend>
      <label>
        Assunto
        <input
          value={subject}
          onChange={(event) => {
            setSubject(event.target.value);
          }}
        />
      </label>
      <label>
        Corpo
        <textarea
          rows={4}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
          }}
        />
      </label>
      {canManage && (
        <div className="form-row">
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => {
              save.mutate();
            }}
          >
            Salvar
          </button>
          {entry.isCustom && (
            <button
              type="button"
              disabled={reset.isPending}
              onClick={() => {
                reset.mutate();
              }}
            >
              Restaurar padrão
            </button>
          )}
        </div>
      )}
    </fieldset>
  );
}

export function NotificationTemplateModule({
  tenantPublicId,
  canManage,
}: {
  tenantPublicId: string;
  canManage: boolean;
}) {
  const templates = useQuery({
    queryKey: ['tenant', tenantPublicId, 'notification-templates'],
    queryFn: () =>
      httpClient.request('/tenant/notification-templates', {
        schema: NotificationTemplateListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  return (
    <section className="platform-form" aria-label="Modelos de mensagens">
      <h3>Modelos de mensagens</h3>
      {templates.isPending ? <p>Carregando…</p> : null}
      {templates.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar os modelos de mensagens.</p>
      ) : null}
      {templates.data?.items.map((entry) => (
        <TemplateEditor
          key={entry.kind}
          entry={entry}
          tenantPublicId={tenantPublicId}
          canManage={canManage}
        />
      ))}
    </section>
  );
}
