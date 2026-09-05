import {
  ProfessionalPublicSchema,
  ProfessionalScheduleResponseSchema,
  ProfessionalUnavailabilityListResponseSchema,
  UpdateProfessionalUnavailabilityRequestSchema,
} from '@plataforma/shared';
import { IconCalendarOff, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient, HttpError } from '../../lib/http.js';
import {
  DataTable,
  EmptyState,
  FormSection,
  InlineAlert,
  ListSkeleton,
  PageHeader,
  SectionCard,
  StatusBadge,
} from '../ui/AppUi.js';

const weekdayLabel = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

const unavailabilityTypes = [
  'BLOCK',
  'DAY_OFF',
  'VACATION',
  'SICK_LEAVE',
  'PERSONAL',
  'OTHER',
] as const;

const typeLabels: Record<(typeof unavailabilityTypes)[number], string> = {
  BLOCK: 'Bloqueio',
  DAY_OFF: 'Folga',
  VACATION: 'Férias',
  SICK_LEAVE: 'Atestado',
  PERSONAL: 'Motivo pessoal',
  OTHER: 'Outro',
};

interface FormState {
  type: (typeof unavailabilityTypes)[number];
  title: string;
  reason: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
}

const initialForm: FormState = {
  type: 'BLOCK',
  title: '',
  reason: '',
  startsAt: '',
  endsAt: '',
  allDay: false,
};

const dateTime = (value: string) => new Date(value).toLocaleString('pt-BR');

export function MyAvailabilityModule({ tenantPublicId }: { tenantPublicId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(initialForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const me = useQuery({
    queryKey: ['tenant', tenantPublicId, 'professionals', 'me'],
    queryFn: () =>
      httpClient.request('/tenant/professionals/me', {
        schema: ProfessionalPublicSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const schedule = useQuery({
    queryKey: ['tenant', tenantPublicId, 'professionals', 'me', 'schedule'],
    queryFn: () =>
      httpClient.request('/tenant/professionals/me/schedule', {
        schema: ProfessionalScheduleResponseSchema,
        tenantPublicId,
      }),
    enabled: me.data !== undefined,
    retry: false,
  });

  const unavailabilitiesQueryKey = [
    'tenant',
    tenantPublicId,
    'professionals',
    'me',
    'unavailabilities',
  ];
  const unavailabilities = useQuery({
    queryKey: unavailabilitiesQueryKey,
    queryFn: () =>
      httpClient.request('/tenant/professionals/me/unavailabilities', {
        schema: ProfessionalUnavailabilityListResponseSchema,
        tenantPublicId,
      }),
    enabled: me.data !== undefined,
    retry: false,
  });

  const invalidateUnavailabilities = () =>
    queryClient.invalidateQueries({ queryKey: unavailabilitiesQueryKey });

  const body = () => ({
    type: form.type,
    title: form.title,
    reason: form.reason === '' ? null : form.reason,
    startsAt: new Date(form.startsAt).toISOString(),
    endsAt: new Date(form.endsAt).toISOString(),
    allDay: form.allDay,
    repeatsWeekly: false,
    recurrenceEndsAt: null,
    unitPublicId: null,
    active: true,
  });

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setForm(initialForm);
  };

  const create = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/professionals/me/unavailabilities', {
        method: 'POST',
        body: UpdateProfessionalUnavailabilityRequestSchema.parse(body()),
        schema: ProfessionalUnavailabilityListResponseSchema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      closeForm();
      await invalidateUnavailabilities();
    },
  });

  const update = useMutation({
    mutationFn: () => {
      if (editing === null) throw new Error('Nenhum bloqueio selecionado.');
      return httpClient.request(`/tenant/professionals/me/unavailabilities/${editing}`, {
        method: 'PATCH',
        body: UpdateProfessionalUnavailabilityRequestSchema.parse(body()),
        schema: ProfessionalUnavailabilityListResponseSchema,
        tenantPublicId,
      });
    },
    onSuccess: async () => {
      closeForm();
      await invalidateUnavailabilities();
    },
  });

  const remove = useMutation({
    mutationFn: (publicId: string) =>
      httpClient.request(`/tenant/professionals/me/unavailabilities/${publicId}`, {
        method: 'DELETE',
        schema: ProfessionalUnavailabilityListResponseSchema,
        tenantPublicId,
      }),
    onSuccess: invalidateUnavailabilities,
  });

  if (me.error instanceof Error) return null;

  const busy = create.isPending || update.isPending || remove.isPending;
  const mutationError = create.error ?? update.error ?? remove.error;
  const errorMessage =
    mutationError instanceof HttpError
      ? mutationError.message
      : mutationError instanceof Error
        ? mutationError.message
        : null;

  const change = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  // Uma linha por dia da semana, com os períodos ativos agrupados e ordenados.
  const week = weekdayLabel.map((label, weekday) => ({
    weekday,
    label,
    periods: (schedule.data?.items ?? [])
      .filter((period) => period.weekday === weekday && period.active)
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt)),
  }));

  const items = unavailabilities.data?.items ?? [];

  return (
    <div className="ds-stack" aria-label="Minha disponibilidade">
      <PageHeader
        eyebrow="Agenda"
        title="Disponibilidade"
        description="Sua jornada semanal e os períodos em que você não atende."
      />

      {me.isPending ? <ListSkeleton rows={3} /> : null}

      {me.data !== undefined && (
        <>
          <SectionCard
            title="Jornada semanal"
            description="Horários em que você fica disponível para agendamentos."
          >
            {schedule.isPending ? <ListSkeleton rows={4} /> : null}
            {schedule.error instanceof Error ? (
              <InlineAlert
                tone="danger"
                title="Não foi possível carregar a jornada"
                action={
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void schedule.refetch()}
                  >
                    Tentar novamente
                  </button>
                }
              >
                Verifique sua conexão e tente novamente.
              </InlineAlert>
            ) : null}
            {schedule.data !== undefined && (
              <div className="data-list availability-week">
                {week.map((day) => (
                  <div className="data-row availability-day" key={day.weekday}>
                    <strong>{day.label}</strong>
                    <StatusBadge active={day.periods.length > 0}>
                      {day.periods.length > 0 ? 'Aberto' : 'Fechado'}
                    </StatusBadge>
                    <div className="availability-periods">
                      {day.periods.length === 0 ? (
                        <span className="muted">Sem atendimento</span>
                      ) : (
                        day.periods.map((period) => (
                          <span className="availability-period" key={period.publicId}>
                            {`${period.startsAt}–${period.endsAt}`}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Bloqueios e folgas"
            description="Cadastre períodos em que não haverá atendimento."
            actions={
              formOpen ? undefined : (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setForm(initialForm);
                    setFormOpen(true);
                  }}
                >
                  <IconPlus size={16} aria-hidden="true" /> Novo bloqueio
                </button>
              )
            }
          >
            {formOpen && (
              <form
                className="app-card availability-form"
                aria-label={editing === null ? 'Novo bloqueio' : 'Editar bloqueio'}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (editing === null) create.mutate();
                  else update.mutate();
                }}
              >
                <FormSection columns={2}>
                  <label>
                    Tipo
                    <select
                      value={form.type}
                      onChange={(event) => {
                        change('type', event.target.value as FormState['type']);
                      }}
                    >
                      {unavailabilityTypes.map((type) => (
                        <option key={type} value={type}>
                          {typeLabels[type]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Título
                    <input
                      value={form.title}
                      onChange={(event) => {
                        change('title', event.target.value);
                      }}
                    />
                  </label>
                  <label className="ds-field-full">
                    Motivo <small>opcional</small>
                    <input
                      value={form.reason}
                      onChange={(event) => {
                        change('reason', event.target.value);
                      }}
                    />
                  </label>
                  <label>
                    Início
                    <input
                      type="datetime-local"
                      value={form.startsAt}
                      onChange={(event) => {
                        change('startsAt', event.target.value);
                      }}
                    />
                  </label>
                  <label>
                    Fim
                    <input
                      type="datetime-local"
                      value={form.endsAt}
                      onChange={(event) => {
                        change('endsAt', event.target.value);
                      }}
                    />
                  </label>
                  <div className="ds-switch-field ds-field-full">
                    <input
                      className="ds-switch"
                      id="unavailability-all-day"
                      checked={form.allDay}
                      type="checkbox"
                      onChange={(event) => {
                        change('allDay', event.target.checked);
                      }}
                    />
                    <label htmlFor="unavailability-all-day">Dia inteiro</label>
                  </div>
                </FormSection>
                {errorMessage !== null && (
                  <p className="form-error" role="alert">
                    {errorMessage}
                  </p>
                )}
                <div className="ds-form-actions">
                  <button
                    className="primary-button"
                    disabled={
                      busy || form.title === '' || form.startsAt === '' || form.endsAt === ''
                    }
                    type="submit"
                  >
                    {busy
                      ? 'Salvando…'
                      : editing === null
                        ? 'Criar bloqueio'
                        : 'Salvar alterações'}
                  </button>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    type="button"
                    onClick={closeForm}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}

            {unavailabilities.isPending ? <ListSkeleton rows={3} /> : null}
            {unavailabilities.error instanceof Error ? (
              <InlineAlert
                tone="danger"
                title="Não foi possível carregar os bloqueios"
                action={
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void unavailabilities.refetch()}
                  >
                    Tentar novamente
                  </button>
                }
              >
                Verifique sua conexão e tente novamente.
              </InlineAlert>
            ) : null}
            {unavailabilities.data !== undefined &&
              (items.length === 0 ? (
                <EmptyState
                  icon={<IconCalendarOff size={22} aria-hidden="true" />}
                  title="Nenhum bloqueio cadastrado."
                  description="Cadastre férias, folgas ou qualquer período sem atendimento para bloquear a agenda."
                />
              ) : (
                <DataTable
                  label="Bloqueios cadastrados"
                  headers={['Tipo', 'Título', 'Início', 'Fim', 'Ações']}
                >
                  {items.map((item) => (
                    <tr key={item.publicId}>
                      <td data-label="Tipo">
                        <StatusBadge tone="info">{typeLabels[item.type]}</StatusBadge>
                      </td>
                      <td data-label="Título">
                        <strong>{item.title}</strong>
                        {item.reason === null || item.reason === undefined ? null : (
                          <>
                            <br />
                            <small className="muted">{item.reason}</small>
                          </>
                        )}
                      </td>
                      <td data-label="Início">{dateTime(item.startsAt)}</td>
                      <td data-label="Fim">{dateTime(item.endsAt)}</td>
                      <td data-label="Ações">
                        <div className="ds-row-actions">
                          <button
                            className="secondary-button button--sm"
                            disabled={busy}
                            type="button"
                            onClick={() => {
                              setEditing(item.publicId);
                              setFormOpen(true);
                              setForm({
                                type: item.type,
                                title: item.title,
                                reason: item.reason ?? '',
                                startsAt: item.startsAt.slice(0, 16),
                                endsAt: item.endsAt.slice(0, 16),
                                allDay: item.allDay,
                              });
                            }}
                          >
                            Editar
                          </button>
                          <button
                            className="danger-button button--sm"
                            disabled={busy}
                            type="button"
                            onClick={() => {
                              remove.mutate(item.publicId);
                            }}
                          >
                            Remover
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </DataTable>
              ))}
          </SectionCard>
        </>
      )}
    </div>
  );
}
