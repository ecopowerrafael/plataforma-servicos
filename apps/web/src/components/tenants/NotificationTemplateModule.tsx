import {
  NotificationTemplateListResponseSchema,
  SuccessResponseSchema,
  type NotificationTemplateEntry,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';
import '../../notification-campaign.css';

const kindLabels: Record<string, string> = {
  'customer.recovery.inactive': 'Cliente inativo',
  'customer.recovery.canceled': 'Atendimento cancelado',
  'customer.recovery.no_show': 'Cliente não compareceu',
  'customer.recovery.post_service': 'Pós-atendimento',
  'customer.recovery.birthday': 'Aniversário do cliente',
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
        body: {
          subject,
          body,
        },
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
    <fieldset className="notification-template-card" disabled={!canManage}>
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
      <small>
        Variáveis: {'{{customerName}}'}, {'{{tenantName}}'}, {'{{value}}'}, {'{{protocol}}'}.
      </small>
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
                if (
                  window.confirm('Restaurar o modelo padrão? A personalização atual será removida.')
                )
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

  const marketingTemplates = templates.data?.items.filter((entry) =>
    entry.kind.startsWith('customer.recovery.'),
  ) ?? [];

  return (
    <section className="notification-campaign" aria-label="Modelos de marketing">
      <div className="notification-template-header">
        <h2>Modelos de marketing</h2>
        <p>Personalize as mensagens de relacionamento e recuperação de clientes.</p>
      </div>
      {templates.isPending ? <p>Carregando…</p> : null}
      {templates.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar os modelos de mensagens.</p>
      ) : null}
      {marketingTemplates.map((entry) => (
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
