import {
  AppointmentPublicSchema,
  CalendarResponseSchema,
  CancelTreatmentPlanRequestSchema,
  CreateTreatmentPlanRequestSchema,
  CreateTreatmentSessionRequestSchema,
  treatmentPlanStateLabel,
  TreatmentPlanPublicSchema,
  UpdateTreatmentPlanRequestSchema,
  type TreatmentPlanPublic,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';

import type { z } from 'zod';

type Appointment = z.infer<typeof AppointmentPublicSchema>;

const money = (cents: string) =>
  (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

const INTERVAL_OPTIONS = [7, 15, 30, 45, 60] as const;

/** Resumo textual do progresso: sem previsão, não inventa "de N". */
export function progressLabel(plan: TreatmentPlanPublic): string {
  if (plan.sessionsPlanned === null)
    return `${String(plan.sessionsCompleted)} ${plan.sessionsCompleted === 1 ? 'sessão realizada' : 'sessões realizadas'}`;
  return `${String(plan.sessionsCompleted)} de ${String(plan.sessionsPlanned)} sessões realizadas`;
}

export function amountLabel(plan: TreatmentPlanPublic): string {
  return plan.billingMode === 'TOTAL'
    ? `${money(plan.amountCents)} total`
    : `${money(plan.amountCents)} por sessão`;
}

/** Formulário de orçamento em bottom sheet, pensado para o celular. */
function QuoteSheet({
  plan,
  suggestedTitle,
  busy,
  error,
  onClose,
  onSave,
}: {
  plan: TreatmentPlanPublic | null;
  /** Sugestão inicial: o nome do serviço, sempre editável. */
  suggestedTitle: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (value: {
    title: string;
    billingMode: 'TOTAL' | 'PER_SESSION';
    amountCents: number;
    sessionsPlanned: number | null;
    returnIntervalDays: number | null;
  }) => void;
}) {
  const [title, setTitle] = useState(plan?.title ?? suggestedTitle);
  const [billingMode, setBillingMode] = useState<'TOTAL' | 'PER_SESSION'>(
    plan?.billingMode ?? 'PER_SESSION',
  );
  const [amount, setAmount] = useState(
    plan === null ? '' : (Number(plan.amountCents) / 100).toString(),
  );
  const [sessions, setSessions] = useState<number | null>(plan?.sessionsPlanned ?? 3);
  const [interval, setInterval] = useState<number | null>(plan?.returnIntervalDays ?? 30);
  const [customInterval, setCustomInterval] = useState(
    plan?.returnIntervalDays != null &&
      !INTERVAL_OPTIONS.includes(plan.returnIntervalDays as (typeof INTERVAL_OPTIONS)[number]),
  );
  const amountCents = Math.round(Number(amount.replace(',', '.')) * 100);
  const valid = Number.isFinite(amountCents) && amountCents > 0 && title.trim().length >= 2;

  return (
    <div className="treatment-sheet-backdrop" role="dialog" aria-label="Definir orçamento">
      <div className="treatment-sheet">
        <h3>{plan === null ? 'Definir orçamento' : 'Editar orçamento'}</h3>
        <label className="treatment-title-field">
          Título do tratamento
          <input
            autoFocus
            maxLength={120}
            placeholder="Ex.: Protocolo Facial Premium"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
          <small>Aparece para o cliente, nas mensagens e no histórico.</small>
        </label>
        <label className="treatment-amount">
          Valor
          <input
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
            }}
          />
          <small>
            {billingMode === 'TOTAL' ? 'Valor total do tratamento' : 'Valor de cada sessão'}
          </small>
        </label>
        <div className="treatment-choice" role="radiogroup" aria-label="Forma de cobrança">
          <span>Forma de cobrança</span>
          <div>
            {(
              [
                ['TOTAL', 'Valor total'],
                ['PER_SESSION', 'Por sessão'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={billingMode === value}
                className={billingMode === value ? 'is-selected' : undefined}
                onClick={() => {
                  setBillingMode(value);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="treatment-stepper">
          <span>Quantidade de sessões</span>
          <div>
            <button
              type="button"
              aria-label="Diminuir sessões"
              onClick={() => {
                setSessions((current) => (current === null || current <= 1 ? null : current - 1));
              }}
            >
              −
            </button>
            <strong>{sessions ?? 'A definir'}</strong>
            <button
              type="button"
              aria-label="Aumentar sessões"
              onClick={() => {
                setSessions((current) => (current === null ? 1 : Math.min(current + 1, 200)));
              }}
            >
              +
            </button>
          </div>
          <small>Pode ficar em aberto se ainda não der para prever.</small>
        </div>
        <div className="treatment-choice" role="radiogroup" aria-label="Intervalo entre sessões">
          <span>Intervalo entre sessões</span>
          <div>
            {INTERVAL_OPTIONS.map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={!customInterval && interval === days}
                className={!customInterval && interval === days ? 'is-selected' : undefined}
                onClick={() => {
                  setCustomInterval(false);
                  setInterval(days);
                }}
              >
                {days} dias
              </button>
            ))}
            <button
              type="button"
              aria-pressed={customInterval}
              className={customInterval ? 'is-selected' : undefined}
              onClick={() => {
                setCustomInterval(true);
              }}
            >
              Personalizado
            </button>
          </div>
          {customInterval ? (
            <input
              type="number"
              min="1"
              max="365"
              aria-label="Intervalo personalizado em dias"
              value={interval ?? ''}
              onChange={(event) => {
                setInterval(event.target.value === '' ? null : Number(event.target.value));
              }}
            />
          ) : null}
          <small>A contagem começa quando a sessão anterior é concluída.</small>
        </div>
        {error === null ? null : (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="ds-form-actions">
          <button
            className="primary-button"
            type="button"
            disabled={busy || !valid}
            onClick={() => {
              onSave({
                title: title.trim(),
                billingMode,
                amountCents,
                sessionsPlanned: sessions,
                returnIntervalDays: interval,
              });
            }}
          >
            {busy ? 'Salvando…' : 'Salvar orçamento'}
          </button>
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Agendamento da sessão dentro do Professional App. Não é uma agenda paralela:
 * os horários vêm do mesmo AvailabilityService e o backend revalida o slot.
 */
function SessionSheet({
  plan,
  tenantPublicId,
  onClose,
  onScheduled,
}: {
  plan: TreatmentPlanPublic;
  tenantPublicId: string;
  onClose: () => void;
  onScheduled: () => void;
}) {
  const suggested = plan.recommendedNextDate ?? new Date().toISOString();
  const [date, setDate] = useState(suggested.slice(0, 10));
  const slots = useQuery({
    queryKey: ['tenant', tenantPublicId, 'professionals', 'me', 'session-slots', date, plan.publicId],
    queryFn: () =>
      httpClient.request(
        `/tenant/professionals/me/availability?from=${date}&to=${date}&servicePublicId=${plan.servicePublicId}`,
        { schema: CalendarResponseSchema, tenantPublicId },
      ),
    retry: false,
  });
  const create = useMutation({
    mutationFn: (startsAt: string) =>
      httpClient.request(`/tenant/professionals/me/treatment-plans/${plan.publicId}/sessions`, {
        method: 'POST',
        body: CreateTreatmentSessionRequestSchema.parse({ startsAt }),
        schema: AppointmentPublicSchema,
        tenantPublicId,
      }),
    onSuccess: onScheduled,
  });
  const available = (slots.data?.days[0]?.slots ?? []).filter(
    (slot) => slot.state === 'AVAILABLE',
  );

  return (
    <div className="treatment-sheet-backdrop" role="dialog" aria-label="Agendar sessão">
      <div className="treatment-sheet">
        <h3>
          {plan.sessions.length === 0 ? 'Agendar primeira sessão' : 'Agendar próxima sessão'}
        </h3>
        <p className="treatment-next">
          {plan.recommendedNextDate === null
            ? 'Escolha a data com o cliente.'
            : `Recomendada a partir de ${day(plan.recommendedNextDate)}.`}
        </p>
        <label className="treatment-amount">
          Dia
          <input
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
            }}
          />
        </label>
        {slots.isPending ? <p className="muted">Carregando horários…</p> : null}
        {slots.error instanceof Error ? (
          <p className="form-error">Não foi possível carregar os horários deste dia.</p>
        ) : null}
        {!slots.isPending && available.length === 0 ? (
          <p className="muted">Nenhum horário livre neste dia. Escolha outra data.</p>
        ) : null}
        <div className="treatment-choice">
          <div>
            {available.map((slot) => (
              <button
                key={slot.startsAt}
                type="button"
                disabled={create.isPending}
                onClick={() => {
                  create.mutate(slot.startsAt);
                }}
              >
                {new Date(slot.startsAt).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </button>
            ))}
          </div>
        </div>
        {create.error instanceof Error ? (
          <p className="form-error" role="alert">
            {create.error.message}
          </p>
        ) : null}
        <div className="ds-form-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Bloco de orçamento/tratamento dentro do atendimento. Fica no próprio card do
 * profissional: nada de tela administrativa no meio do atendimento.
 */
export function TreatmentPlanPanel({
  appointment,
  tenantPublicId,
  onScheduleSession,
  allowStaffApproval = false,
}: {
  appointment: Appointment;
  tenantPublicId: string;
  /** Sem handler o próprio painel agenda pelas rotas do profissional. */
  onScheduleSession?: (plan: TreatmentPlanPublic) => void;
  /**
   * Aprovação administrativa (exceção). A aprovação normal é do cliente, então
   * ela só aparece para quem administra a agenda — nunca no app do profissional.
   */
  allowStaffApproval?: boolean;
}) {
  const client = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sessionSheet, setSessionSheet] = useState(false);
  const isEvaluation = appointment.kind === 'EVALUATION';
  const isSession = appointment.kind === 'TREATMENT_SESSION';
  const queryKey = ['tenant', tenantPublicId, 'treatment-plan', appointment.publicId];

  const plan = useQuery({
    queryKey,
    enabled: isEvaluation || isSession,
    queryFn: () =>
      isSession
        ? httpClient.request(
            `/tenant/treatment-plans/${appointment.treatmentPlanPublicId ?? ''}`,
            { schema: TreatmentPlanPublicSchema, tenantPublicId },
          )
        : httpClient.request(`/tenant/appointments/${appointment.publicId}/treatment-plan`, {
            schema: TreatmentPlanPublicSchema.nullable(),
            tenantPublicId,
          }),
    retry: false,
  });

  const refresh = async () => {
    await client.invalidateQueries({ queryKey });
  };

  const save = useMutation({
    mutationFn: (value: {
      title: string;
      billingMode: 'TOTAL' | 'PER_SESSION';
      amountCents: number;
      sessionsPlanned: number | null;
      returnIntervalDays: number | null;
    }) => {
      const current = plan.data;
      if (current === null || current === undefined)
        return httpClient.request('/tenant/treatment-plans', {
          method: 'POST',
          body: CreateTreatmentPlanRequestSchema.parse({
            ...value,
            appointmentPublicId: appointment.publicId,
          }),
          schema: TreatmentPlanPublicSchema,
          tenantPublicId,
        });
      return httpClient.request(`/tenant/treatment-plans/${current.publicId}`, {
        method: 'PATCH',
        body: UpdateTreatmentPlanRequestSchema.parse(value),
        schema: TreatmentPlanPublicSchema,
        tenantPublicId,
      });
    },
    onSuccess: async () => {
      setSheetOpen(false);
      await refresh();
    },
  });

  const approve = useMutation({
    mutationFn: (publicId: string) =>
      httpClient.request(`/tenant/treatment-plans/${publicId}/approve`, {
        method: 'POST',
        schema: TreatmentPlanPublicSchema,
        tenantPublicId,
      }),
    onSuccess: refresh,
  });

  const cancel = useMutation({
    mutationFn: (publicId: string) =>
      httpClient.request(`/tenant/treatment-plans/${publicId}/cancel`, {
        method: 'POST',
        body: CancelTreatmentPlanRequestSchema.parse({}),
        schema: TreatmentPlanPublicSchema,
        tenantPublicId,
      }),
    onSuccess: refresh,
  });

  if (!isEvaluation && !isSession) return null;
  if (plan.isPending) return <p className="treatment-panel muted">Carregando orçamento…</p>;
  const error = [save.error, approve.error, cancel.error].find(
    (item): item is Error => item instanceof Error,
  );
  const current = plan.data ?? null;

  if (current === null)
    return (
      <div className="treatment-panel treatment-panel--pending">
        <span className="ds-badge ds-badge--warning">Orçamento pendente</span>
        <p>Defina o valor do tratamento com o cliente ainda no atendimento.</p>
        <button
          className="primary-button button--sm"
          type="button"
          onClick={() => {
            setSheetOpen(true);
          }}
        >
          Definir orçamento
        </button>
        {sheetOpen ? (
          <QuoteSheet
            plan={null}
            suggestedTitle={appointment.serviceName}
            busy={save.isPending}
            error={error?.message ?? null}
            onClose={() => {
              setSheetOpen(false);
            }}
            onSave={(value) => {
              save.mutate(value);
            }}
          />
        ) : null}
      </div>
    );

  const closed = current.status === 'CANCELED' || current.status === 'COMPLETED';
  return (
    <div className="treatment-panel">
      <div className="treatment-panel-head">
        <strong>{current.title}</strong>
        <span className={`ds-badge ds-badge--${current.status === 'CANCELED' ? 'danger' : 'info'}`}>
          {current.status === 'PENDING'
            ? 'Aguardando aprovação do cliente'
            : treatmentPlanStateLabel(current)}
        </span>
      </div>
      {current.status === 'PENDING' ? (
        <p className="treatment-sent">✓ Orçamento definido. O cliente foi avisado.</p>
      ) : null}
      <ul className="treatment-facts">
        <li>{amountLabel(current)}</li>
        {current.sessionsPlanned === null ? null : (
          <li>{`${String(current.sessionsPlanned)} sessões previstas`}</li>
        )}
        {current.estimatedTotalCents === null ? null : (
          <li>{`Total estimado: ${money(current.estimatedTotalCents)}`}</li>
        )}
        {current.returnIntervalDays === null ? null : (
          <li>{`Intervalo: ${String(current.returnIntervalDays)} dias`}</li>
        )}
        <li>{progressLabel(current)}</li>
        {isSession && appointment.sessionNumber !== null ? (
          <li>
            {current.sessionsPlanned === null
              ? `Sessão ${String(appointment.sessionNumber)}`
              : `Sessão ${String(appointment.sessionNumber)} de ${String(current.sessionsPlanned)}`}
          </li>
        ) : null}
        {current.lastCompletedSessionAt === null ? null : (
          <li>{`Última sessão: ${day(current.lastCompletedSessionAt)}`}</li>
        )}
      </ul>
      {/* Antes da primeira conclusão não existe data de retorno — só a regra. */}
      <p className="treatment-next">
        {current.recommendedNextDate === null
          ? current.returnIntervalDays === null
            ? 'A próxima sessão pode ser agendada quando o cliente quiser.'
            : `A próxima sessão será recomendada ${String(current.returnIntervalDays)} dias após a conclusão desta.`
          : `Próxima sessão recomendada: ${day(current.recommendedNextDate)}`}
      </p>
      {error === undefined ? null : (
        <p className="form-error" role="alert">
          {error.message}
        </p>
      )}
      <div className="treatment-actions">
        {/* A aprovação é do cliente. Aqui fica só a exceção administrativa. */}
        {current.status === 'PENDING' ? (
          allowStaffApproval ? (
            <button
              className="text-button button--sm"
              type="button"
              disabled={approve.isPending}
              onClick={() => {
                approve.mutate(current.publicId);
              }}
            >
              {approve.isPending ? 'Aprovando…' : 'Aprovar pelo estabelecimento'}
            </button>
          ) : null
        ) : closed ? null : (
          <button
            className="primary-button button--sm"
            type="button"
            onClick={() => {
              if (onScheduleSession === undefined) setSessionSheet(true);
              else onScheduleSession(current);
            }}
          >
            {current.sessionsCompleted === 0 && current.sessions.length === 0
              ? 'Agendar primeira sessão'
              : 'Agendar próxima sessão'}
          </button>
        )}
        {closed ? null : (
          <button
            className="secondary-button button--sm"
            type="button"
            onClick={() => {
              setSheetOpen(true);
            }}
          >
            Editar orçamento
          </button>
        )}
        {closed || !isEvaluation ? null : (
          <button
            className="text-button button--sm"
            type="button"
            disabled={cancel.isPending}
            onClick={() => {
              cancel.mutate(current.publicId);
            }}
          >
            Cancelar tratamento
          </button>
        )}
      </div>
      {sessionSheet ? (
        <SessionSheet
          plan={current}
          tenantPublicId={tenantPublicId}
          onClose={() => {
            setSessionSheet(false);
          }}
          onScheduled={() => {
            setSessionSheet(false);
            void refresh();
          }}
        />
      ) : null}
      {sheetOpen ? (
        <QuoteSheet
          plan={current}
          suggestedTitle={appointment.serviceName}
          busy={save.isPending}
          error={error?.message ?? null}
          onClose={() => {
            setSheetOpen(false);
          }}
          onSave={(value) => {
            save.mutate(value);
          }}
        />
      ) : null}
    </div>
  );
}
