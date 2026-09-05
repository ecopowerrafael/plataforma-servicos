import {
  CreateNotificationCampaignRequestSchema,
  CustomerListResponseSchema,
  NotificationCampaignListResponseSchema,
  NotificationCampaignSummarySchema,
  ProfessionalListResponseSchema,
  WhatsAppConfigSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import {
  EmptyState,
  InlineAlert,
  ListSkeleton,
  PageHeader,
  SectionCard,
  StatCard,
  StatGrid,
  StatusBadge,
} from '../ui/AppUi.js';
import { httpClient } from '../../lib/http.js';
import '../../notification-campaign.css';

export function NotificationCampaignModule({
  tenantPublicId,
  canReadIntegrations,
}: {
  tenantPublicId: string;
  canReadIntegrations: boolean;
}) {
  const client = useQueryClient();
  const [audience, setAudience] = useState<'CUSTOMERS' | 'PROFESSIONALS'>('CUSTOMERS');
  const [mode, setMode] = useState<'ALL' | 'SELECTED'>('ALL');
  const [channel, setChannel] = useState<'PUSH' | 'WHATSAPP'>('PUSH');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [ack, setAck] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const campaigns = useQuery({
    queryKey: ['tenant', tenantPublicId, 'notification-campaigns'],
    queryFn: () =>
      httpClient.request('/tenant/notification-campaigns', {
        schema: NotificationCampaignListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const whatsapp = useQuery({
    queryKey: ['tenant', tenantPublicId, 'whatsapp'],
    queryFn: () =>
      httpClient.request('/tenant/integrations/whatsapp', {
        schema: WhatsAppConfigSchema,
        tenantPublicId,
      }),
    enabled: canReadIntegrations,
    retry: false,
  });
  const people = useQuery({
    queryKey: ['tenant', tenantPublicId, 'campaign-people', audience, search],
    queryFn: () =>
      httpClient.request(
        `${audience === 'CUSTOMERS' ? '/tenant/customers?page=1&limit=100&status=true' : '/tenant/professionals?page=1&limit=100&active=true'}${search.trim() === '' ? '' : `&search=${encodeURIComponent(search.trim())}`}`,
        {
          schema:
            audience === 'CUSTOMERS' ? CustomerListResponseSchema : ProfessionalListResponseSchema,
          tenantPublicId,
        },
      ),
    enabled: mode === 'SELECTED',
    retry: false,
  });
  const personItems = useMemo(() => people.data?.items ?? [], [people.data]);
  const invalid =
    message.trim() === '' ||
    (channel === 'PUSH' && title.trim() === '') ||
    (mode === 'SELECTED' && selected.length === 0);
  const send = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/notification-campaigns', {
        method: 'POST',
        body: CreateNotificationCampaignRequestSchema.parse({
          audience,
          recipientMode: mode,
          recipientPublicIds: selected,
          idempotencyKey,
          channel,
          ...(channel === 'PUSH' ? { title } : {}),
          message,
          whatsappRiskAcknowledged: ack,
        }),
        schema: NotificationCampaignSummarySchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      setConfirm(false);
      setReviewing(false);
      setMessage('');
      setTitle('');
      setSelected([]);
      void client.invalidateQueries({
        queryKey: ['tenant', tenantPublicId, 'notification-campaigns'],
      });
    },
  });
  const latest = campaigns.data?.items[0];
  return (
    <section className="notification-campaign" aria-label="Central de comunicação">
      <PageHeader
        eyebrow="Marketing"
        title="Notificações"
        description="Envie comunicações para clientes e profissionais pelos canais disponíveis."
        actions={
          <button className="primary-button" type="button" onClick={() => { setIdempotencyKey(crypto.randomUUID()); setConfirm(true); }}>
            + Nova notificação
          </button>
        }
      />
      {latest ? (
        <StatGrid>
          <StatCard label="Na fila" value={String(latest.queued)} />
          <StatCard label="Enviadas" value={String(latest.sent)} tone="success" />
          <StatCard label="Falhas" value={String(latest.failed)} tone="danger" />
          <StatCard label="Ignoradas" value={String(latest.skipped)} tone="warning" />
        </StatGrid>
      ) : null}
      {confirm ? (
        <SectionCard
          title="Nova notificação"
          description="Revise os destinatários antes de confirmar o envio."
        >
          <div className="notification-campaign-grid">
            <label>
              Público
              <select
                value={audience}
                onChange={(e) => {
                  const next = e.target.value as typeof audience;
                  setAudience(next);
                  if (next === 'PROFESSIONALS') setChannel('WHATSAPP');
                  setSelected([]);
                  setReviewing(false);
                }}
              >
                <option value="CUSTOMERS">Clientes</option>
                <option value="PROFESSIONALS">Profissionais</option>
              </select>
            </label>
            <label>
              Destinatários
              <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                <option value="ALL">Todos</option>
                <option value="SELECTED">Selecionar pessoas</option>
              </select>
            </label>
            <label>
              Canal
              <select
                value={channel}
                onChange={(e) => {
                  setChannel(e.target.value as typeof channel);
                  setReviewing(false);
                }}
              >
                <option value="PUSH" disabled={audience === 'PROFESSIONALS'}>
                  Push
                </option>
                <option
                  value="WHATSAPP"
                  disabled={whatsapp.data?.available === false || whatsapp.data?.active === false}
                >
                  WhatsApp
                </option>
              </select>
              {whatsapp.data?.available === false ? (
                <small>Disponível em outros planos.</small>
              ) : whatsapp.data?.configured === false || whatsapp.data?.active === false ? (
                <small>
                  Configure o WhatsApp em <a href="/app/empresa/integracoes">Integrações</a>.
                </small>
              ) : null}
            </label>
            {channel === 'PUSH' ? (
              <label>
                Título
                <input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
              </label>
            ) : null}
            <label className="notification-campaign-field-wide">
              Mensagem
              <textarea
                rows={5}
                maxLength={4000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <small>{message.length}/4000</small>
            </label>
          </div>
          {mode === 'SELECTED' ? (
            <>
              <label className="campaign-search">
                Buscar nome, telefone ou e-mail
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setReviewing(false);
                  }}
                  placeholder="Buscar nome, telefone ou e-mail"
                />
              </label>
              <div className="campaign-people">
                {people.isPending ? (
                  <ListSkeleton rows={4} />
                ) : (
                  personItems.map((person) => (
                    <label key={person.publicId}>
                      <input
                        type="checkbox"
                        checked={selected.includes(person.publicId)}
                        onChange={(event) => {
                          setReviewing(false);
                          setSelected((current) =>
                            event.target.checked
                              ? [...current, person.publicId]
                              : current.filter((id) => id !== person.publicId),
                          );
                        }}
                      />{' '}
                      <strong>{person.name}</strong>{' '}
                      {'whatsapp' in person
                        ? (person.whatsapp ?? person.phone ?? person.email ?? 'Sem contato')
                        : (person.phone ?? person.email ?? 'Sem contato')}
                    </label>
                  ))
                )}
                <small>{selected.length} selecionados</small>
              </div>
            </>
          ) : null}
          {channel === 'WHATSAPP' ? (
            <InlineAlert tone="warning" title="Envio em massa requer cuidado">
              Envios em grande volume pelo WhatsApp podem gerar limitações ou bloqueio do número.
              Envie apenas para contatos que autorizaram o recebimento.
            </InlineAlert>
          ) : null}
          {channel === 'WHATSAPP' ? (
            <label>
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />{' '}
              Entendo os riscos e confirmo que estes contatos autorizaram o recebimento.
            </label>
          ) : null}
          {reviewing ? (
            <InlineAlert title="Confirmar envio" tone="info">
              {`${audience === 'CUSTOMERS' ? 'Clientes' : 'Profissionais'} · ${mode === 'ALL' ? 'todos os contatos elegíveis' : `${String(selected.length)} selecionados`} · ${channel}`}
              <br />
              {message}
            </InlineAlert>
          ) : null}
          <div className="form-row">
            <button
              type="button"
              onClick={() => (reviewing ? setReviewing(false) : setConfirm(false))}
            >
              Voltar
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={send.isPending || invalid}
              onClick={() => (reviewing ? send.mutate() : setReviewing(true))}
            >
              {reviewing
                ? send.isPending
                  ? 'Iniciando…'
                  : 'Enviar notificações'
                : 'Revisar envio'}
            </button>
          </div>
          {send.error instanceof Error ? <p className="form-error">{send.error.message}</p> : null}
        </SectionCard>
      ) : null}
      <SectionCard
        title="Acompanhamento"
        description="Campanhas recentes; detalhes individuais continuam restritos a falhas e auditoria."
      >
        {campaigns.isPending ? (
          <ListSkeleton />
        ) : campaigns.data?.items.length === 0 ? (
          <EmptyState
            title="Nenhuma comunicação enviada"
            description="Crie uma notificação para iniciar um envio em lote."
          />
        ) : (
          <div className="campaign-list">
            {campaigns.data?.items.map((item) => (
              <article key={item.publicId}>
                <div>
                  <strong>{item.title || 'Mensagem WhatsApp'}</strong>
                  <p>
                    {item.recipientCount} destinatários · {item.deliveryCount} entregas · {item.channel}
                  </p>
                </div>
                <div>
                  <StatusBadge tone={item.failed > 0 ? 'warning' : 'success'}>
                    {item.sent} enviadas
                  </StatusBadge>
                  <small>
                    {item.queued} na fila · {item.failed} falhas · {item.skippedCount} ignoradas · {item.status}
                  </small>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </section>
  );
}
