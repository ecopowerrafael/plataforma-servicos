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
  'appointment.booking_confirmed': 'Novo agendamento confirmado',
  'appointment.booking_canceled': 'Cancelamento de agendamento',
};

function EmailTemplateEditor({
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
  const [title, setTitle] = useState(entry.title);
  const [intro, setIntro] = useState(entry.intro);
  const [afterText, setAfterText] = useState(entry.afterText);
  const [ctaLabel, setCtaLabel] = useState(entry.ctaLabel);

  const editableFullEmail = entry.kind === 'appointment.booking_confirmed';

  const save = useMutation({
    mutationFn: () =>
      httpClient.request(`/tenant/notification-templates/${entry.kind}`, {
        method: 'PUT',
        body: {
          subject,
          body,
          ...(editableFullEmail ? { title, intro, afterText, ctaLabel } : {}),
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
        {editableFullEmail ? 'Fallback em texto simples' : 'Corpo'}
        <textarea
          rows={4}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
          }}
        />
      </label>
      {editableFullEmail ? (
        <>
          <p>
            <strong>Canal:</strong> E-mail
          </p>
          <label>
            Título principal
            <input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
              }}
            />
          </label>
          <label>
            Texto introdutório
            <textarea
              rows={3}
              value={intro}
              onChange={(event) => {
                setIntro(event.target.value);
              }}
            />
          </label>
          <label>
            Texto após os dados
            <textarea
              rows={3}
              value={afterText}
              onChange={(event) => {
                setAfterText(event.target.value);
              }}
            />
          </label>
          <label>
            Texto do botão
            <input
              value={ctaLabel}
              onChange={(event) => {
                setCtaLabel(event.target.value);
              }}
            />
          </label>
          <aside className="notification-template-preview" aria-label="Prévia do e-mail">
            <small>Prévia do e-mail</small>
            <strong>{title || 'Seu agendamento está confirmado'}</strong>
            <p>{intro || 'Olá, Cliente! Seu horário foi reservado com sucesso.'}</p>
            <dl>
              <div>
                <dt>Serviço</dt>
                <dd>Serviço</dd>
              </div>
              <div>
                <dt>Profissional</dt>
                <dd>Profissional</dd>
              </div>
              <div>
                <dt>Data</dt>
                <dd>14 de agosto</dd>
              </div>
              <div>
                <dt>Horário</dt>
                <dd>14:15</dd>
              </div>
            </dl>
            <span>{ctaLabel || 'Ver meu agendamento'}</span>
            <p>{afterText}</p>
          </aside>
          <small>
            Variáveis: {'{{customerName}}'}, {'{{tenantName}}'}, {'{{serviceName}}'},{' '}
            {'{{professionalName}}'}, {'{{date}}'}, {'{{time}}'}, {'{{unitName}}'}, {'{{value}}'},{' '}
            {'{{protocol}}'} e {'{{appointmentUrl}}'}.
          </small>
        </>
      ) : null}
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

const emailKinds = ['appointment.booking_confirmed', 'appointment.booking_canceled'];

export function EmailTemplateModule({
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

  const emailTemplates = templates.data?.items.filter((entry) => emailKinds.includes(entry.kind)) ?? [];

  return (
    <section className="notification-campaign" aria-label="E-mails automáticos">
      <div className="notification-template-header">
        <h2>E-mails automáticos</h2>
        <p>Personalize os e-mails enviados automaticamente aos seus clientes.</p>
      </div>
      {templates.isPending ? <p>Carregando…</p> : null}
      {templates.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar os modelos de e-mail.</p>
      ) : null}
      {emailTemplates.map((entry) => (
        <EmailTemplateEditor
          key={entry.kind}
          entry={entry}
          tenantPublicId={tenantPublicId}
          canManage={canManage}
        />
      ))}
    </section>
  );
}
