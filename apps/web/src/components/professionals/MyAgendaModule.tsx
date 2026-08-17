import {
  AgendaOverviewResponseSchema,
  AppointmentListResponseSchema,
  AppointmentPublicSchema,
  AppointmentStatusResponseSchema,
  CalendarResponseSchema,
  ProfessionalPublicSchema,
  ProfessionalServicesResponseSchema,
  type AppointmentPaymentState,
  type TreatmentPlanPublic,
} from '@plataforma/shared';
import { IconCalendarOff, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  addDays,
  buildTimeline,
  dayKey,
  durationLabel,
  freeBlocks,
  isOpen,
  longDayLabel,
  nextAppointment,
  timeLabel,
  today,
  weekdayShort,
  type Appointment,
} from './my-agenda.js';
import {
  MyAgendaNextCard,
  MyAgendaTimeline,
  type MyAgendaHandlers,
  type MyAgendaPermissions,
} from './MyAgendaTimeline.js';
import { TreatmentPlanPanel } from './TreatmentPlanPanel.js';
import { httpClient, HttpError } from '../../lib/http.js';
import { AgendaCompleteDialog, type AgendaCompleteTarget } from '../agenda/AgendaCompleteDialog.js';
import { AppointmentEditorDialog } from '../appointments/AppointmentEditorDialog.js';
import { CalendarModule } from '../calendar/CalendarModule.js';
import { ConfirmationDialog, type ConfirmationRequest } from '../ConfirmationDialog.js';
import { EmptyState, ListSkeleton, PageHeader, SectionCard } from '../ui/AppUi.js';

const DAY_STRIP_LENGTH = 7;

export function MyAgendaModule({
  tenantPublicId,
  canViewCalendar = false,
  canManageStatus = false,
  canCheckIn = false,
  canCreate = false,
  canReadPayments = false,
  canManagePayments = false,
  canReadCustomers = false,
  selfOnly = false,
}: {
  tenantPublicId: string;
  /** Calendário da equipe exige leitura de agendamentos do estabelecimento. */
  canViewCalendar?: boolean;
  canManageStatus?: boolean;
  canCheckIn?: boolean;
  canCreate?: boolean;
  canReadPayments?: boolean;
  canManagePayments?: boolean;
  canReadCustomers?: boolean;
  /** O Professional App nunca usa endpoints administrativos nem seleciona outro profissional. */
  selfOnly?: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [view, setView] = useState<'agenda' | 'calendar'>('agenda');
  const [mode, setMode] = useState<'day' | 'upcoming'>('day');
  const [date, setDate] = useState(today);
  const [notesFor, setNotesFor] = useState<string | null>(null);
  /** Plano cuja próxima sessão está sendo agendada no fluxo normal da agenda. */
  const [sessionPlan, setSessionPlan] = useState<TreatmentPlanPublic | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const [completeTarget, setCompleteTarget] = useState<
    (AgendaCompleteTarget & { mode: 'complete' | 'payment' }) | null
  >(null);

  // Janela fixa de 7 dias a partir do dia selecionado: alimenta a faixa de dias,
  // a timeline e o modo "Próximos" com uma única consulta.
  const windowStart = date;
  const windowEnd = addDays(date, DAY_STRIP_LENGTH - 1);
  const windowFrom = new Date(`${windowStart}T00:00:00`).toISOString();
  const windowTo = new Date(`${windowEnd}T23:59:59.999`).toISOString();

  const me = useQuery({
    queryKey: ['tenant', tenantPublicId, 'professionals', 'me'],
    queryFn: () =>
      httpClient.request('/tenant/professionals/me', {
        schema: ProfessionalPublicSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const agendaQueryKey = [
    'tenant',
    tenantPublicId,
    'professionals',
    'me',
    'agenda',
    windowFrom,
    windowTo,
  ];
  const agenda = useQuery({
    queryKey: agendaQueryKey,
    queryFn: () =>
      httpClient.request(
        `/tenant/professionals/me/agenda?from=${encodeURIComponent(windowFrom)}&to=${encodeURIComponent(windowTo)}`,
        { schema: AppointmentListResponseSchema, tenantPublicId },
      ),
    enabled: me.data !== undefined,
    retry: false,
  });

  const myServices = useQuery({
    queryKey: ['tenant', tenantPublicId, 'professionals', 'me', 'services'],
    queryFn: () =>
      httpClient.request('/tenant/professionals/me/services', {
        schema: ProfessionalServicesResponseSchema,
        tenantPublicId,
      }),
    enabled: me.data !== undefined,
    retry: false,
  });
  // A grade de horários livres é calculada para a duração de um serviço concreto: usamos o
  // primeiro serviço ativo apenas como referência visual, nunca como disponibilidade universal.
  const referenceService = myServices.data?.items.find((item) => item.active)?.servicePublicId;

  const availability = useQuery({
    queryKey: [
      'tenant',
      tenantPublicId,
      'professionals',
      'me',
      'availability',
      date,
      referenceService,
    ],
    queryFn: () =>
      httpClient.request(
        `/tenant/professionals/me/availability?from=${date}&to=${date}&servicePublicId=${referenceService ?? ''}`,
        { schema: CalendarResponseSchema, tenantPublicId },
      ),
    enabled: referenceService !== undefined && mode === 'day',
    retry: false,
  });

  // Situação financeira: só é consultada com permissão de leitura de pagamentos.
  const payments = useQuery({
    queryKey: [
      'tenant',
      tenantPublicId,
      'professionals',
      'me',
      'payments',
      windowFrom,
      windowTo,
      me.data?.publicId,
    ],
    queryFn: () =>
      httpClient.request(
        `/tenant/agenda/overview?from=${encodeURIComponent(windowFrom)}&to=${encodeURIComponent(windowTo)}&professionalPublicId=${me.data?.publicId ?? ''}&offsetMinutes=${String(new Date().getTimezoneOffset())}`,
        { schema: AgendaOverviewResponseSchema, tenantPublicId },
      ),
    enabled: canReadPayments && canViewCalendar && me.data !== undefined,
    retry: false,
  });

  const invalidateAgenda = async () => {
    await queryClient.invalidateQueries({ queryKey: agendaQueryKey });
    await queryClient.invalidateQueries({
      queryKey: ['tenant', tenantPublicId, 'professionals', 'me', 'payments'],
    });
  };

  const saveNotes = useMutation({
    mutationFn: ({ publicId, notes }: { publicId: string; notes: string }) =>
      httpClient.request(`/tenant/professionals/me/appointments/${publicId}/notes`, {
        method: 'PATCH',
        body: { notes: notes === '' ? null : notes },
        schema: AppointmentPublicSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      setNotesFor(null);
      void invalidateAgenda();
    },
  });

  /** Transições próprias do profissional. */
  const selfStatus = useMutation({
    mutationFn: ({
      publicId,
      status,
      reason,
    }: {
      publicId: string;
      status: 'in_progress' | 'completed' | 'no_show' | 'canceled';
      reason?: string;
    }) =>
      httpClient.request(`/tenant/professionals/me/appointments/${publicId}/${status}`, {
        method: 'POST',
        body: reason === undefined || reason === '' ? {} : { reason },
        schema: AppointmentStatusResponseSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      void invalidateAgenda();
    },
  });

  /** Mantido para a agenda administrativa; o Professional App usa somente a rota SELF. */
  const tenantStatus = useMutation({
    mutationFn: ({
      publicId,
      status,
      reason,
    }: {
      publicId: string;
      status: 'confirmed' | 'canceled';
      reason?: string;
    }) =>
      httpClient.request(`/tenant/appointments/${publicId}/${status}`, {
        method: 'POST',
        body: reason === undefined || reason === '' ? {} : { reason },
        schema: AppointmentStatusResponseSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      void invalidateAgenda();
    },
  });

  const checkIn = useMutation({
    mutationFn: (publicId: string) =>
      httpClient.request(`/tenant/appointments/${publicId}/checkin`, {
        method: 'POST',
        body: {},
        schema: AppointmentPublicSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      void invalidateAgenda();
    },
  });

  const items = useMemo(
    () =>
      [...(agenda.data?.items ?? [])].sort((left, right) =>
        left.startsAt.localeCompare(right.startsAt),
      ),
    [agenda.data],
  );
  const dayItems = useMemo(
    () => items.filter((item) => dayKey(item.startsAt) === date),
    [items, date],
  );
  const countsByDay = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items)
      if (isOpen(item))
        counts.set(dayKey(item.startsAt), (counts.get(dayKey(item.startsAt)) ?? 0) + 1);
    return counts;
  }, [items]);

  const paymentStates = useMemo(() => {
    const map = new Map<string, AppointmentPaymentState>();
    for (const entry of payments.data?.payments ?? [])
      map.set(entry.appointmentPublicId, entry.state);
    return map;
  }, [payments.data]);
  const balanceOf = (publicId: string) => {
    const entry = payments.data?.payments.find((item) => item.appointmentPublicId === publicId);
    return entry === undefined
      ? 0
      : Math.max(Number(entry.expectedCents) - Number(entry.receivedCents), 0);
  };

  const blocks = useMemo(
    () => freeBlocks(availability.data?.days[0]?.slots ?? [], dayItems),
    [availability.data, dayItems],
  );
  const timeline = useMemo(() => buildTimeline(dayItems, blocks), [dayItems, blocks]);
  const next = useMemo(
    () => (date === today() ? nextAppointment(dayItems) : null),
    [dayItems, date],
  );

  const bookedMinutes = dayItems
    .filter(isOpen)
    .reduce((total, item) => total + item.durationMinutes, 0);
  const freeMinutes = blocks.reduce((total, block) => total + block.minutes, 0);

  const permissions: MyAgendaPermissions = {
    canConfirm: canManageStatus,
    canCheckIn,
    canCancel: canManageStatus,
    canCreate,
    canReadCustomers,
    canReadPayments,
    canManagePayments,
  };

  const busy =
    selfStatus.isPending || tenantStatus.isPending || checkIn.isPending || saveNotes.isPending;
  const actionError = [selfStatus.error, tenantStatus.error, checkIn.error, saveNotes.error].find(
    (error): error is Error => error instanceof Error,
  );

  const complete = (appointment: Appointment) => {
    const state = paymentStates.get(appointment.publicId);
    if (!canReadPayments || state === undefined || state === 'PAID') {
      selfStatus.mutate({ publicId: appointment.publicId, status: 'completed' });
      return;
    }
    setCompleteTarget({
      publicId: appointment.publicId,
      customerName: appointment.customerName,
      balanceCents: balanceOf(appointment.publicId),
      mode: 'complete',
    });
  };

  const handlers: MyAgendaHandlers = {
    onPrimary: (appointment, action) => {
      if (action === 'confirm') {
        if (selfOnly) return;
        tenantStatus.mutate({ publicId: appointment.publicId, status: 'confirmed' });
        return;
      }
      if (action === 'start') {
        selfStatus.mutate({ publicId: appointment.publicId, status: 'in_progress' });
        return;
      }
      complete(appointment);
    },
    onCheckIn: (appointment) => {
      checkIn.mutate(appointment.publicId);
    },
    onNoShow: (appointment) => {
      setConfirmation({
        title: 'Marcar falta do cliente?',
        description: `${appointment.customerName} será registrado como falta. Informe o motivo se quiser.`,
        confirmLabel: 'Marcar falta',
        requiresReason: false,
        variant: 'danger',
        onConfirm: async (reason) => {
          await selfStatus.mutateAsync({
            publicId: appointment.publicId,
            status: 'no_show',
            reason,
          });
        },
      });
    },
    onCancel: (appointment) => {
      setConfirmation({
        title: 'Cancelar agendamento?',
        description: `O agendamento de ${appointment.customerName} será cancelado. Informe o motivo.`,
        confirmLabel: 'Cancelar agendamento',
        requiresReason: true,
        reasonLabel: 'Motivo do cancelamento',
        variant: 'danger',
        onConfirm: async (reason) => {
          if (selfOnly)
            await selfStatus.mutateAsync({
              publicId: appointment.publicId,
              status: 'canceled',
              reason,
            });
          else
            await tenantStatus.mutateAsync({
              publicId: appointment.publicId,
              status: 'canceled',
              reason,
            });
        },
      });
    },
    onReschedule: (appointment) => {
      void navigate(`/app/agenda/agendamentos?appointmentPublicId=${appointment.publicId}`);
    },
    onOpenCustomer: (appointment) => {
      if (canReadCustomers) void navigate(`/app/clientes/${appointment.customerPublicId}`);
    },
    onNotes: (appointment) => {
      setNotesFor(appointment.publicId);
      setNotesDraft(appointment.notes ?? '');
    },
    onPayment: (appointment) => {
      setCompleteTarget({
        publicId: appointment.publicId,
        customerName: appointment.customerName,
        balanceCents: balanceOf(appointment.publicId),
        mode: 'payment',
      });
    },
    onCreateAt: () => {
      void navigate('/app/agenda/agendamentos');
    },
  };

  const notesSlot = (appointment: Appointment) => (
    <div className="my-agenda-notes">
      <label>
        Observações do atendimento
        <textarea
          rows={3}
          value={notesDraft}
          onChange={(event) => {
            setNotesDraft(event.target.value);
          }}
        />
      </label>
      <div className="ds-form-actions">
        <button
          className="primary-button button--sm"
          type="button"
          disabled={busy}
          onClick={() => {
            saveNotes.mutate({ publicId: appointment.publicId, notes: notesDraft });
          }}
        >
          {saveNotes.isPending ? 'Salvando…' : 'Salvar'}
        </button>
        <button
          className="secondary-button button--sm"
          type="button"
          onClick={() => {
            setNotesFor(null);
          }}
        >
          Fechar
        </button>
      </div>
    </div>
  );

  // Orçamento e sessões aparecem dentro do próprio atendimento.
  // No Professional App a sessão é agendada pelas rotas do próprio
  // profissional; no painel, pelo editor completo da agenda.
  const treatmentSlot = (appointment: Appointment) => (
    <TreatmentPlanPanel
      appointment={appointment}
      tenantPublicId={tenantPublicId}
      {...(selfOnly || !canCreate
        ? {}
        : {
            onScheduleSession: (plan: TreatmentPlanPublic) => {
              setSessionPlan(plan);
            },
          })}
    />
  );

  if (me.error instanceof Error) return null;

  const dayStrip = Array.from({ length: DAY_STRIP_LENGTH }, (_, index) => addDays(date, index));
  const upcoming = [...countsByDay.keys()]
    .filter((key) => key >= today())
    .sort()
    .map((key) => ({
      key,
      items: items.filter((item) => dayKey(item.startsAt) === key && isOpen(item)),
    }));
  const todayAppointments = countsByDay.get(today()) ?? 0;
  const todayLabel =
    todayAppointments === 0
      ? 'Nenhum atendimento hoje'
      : `${String(todayAppointments)} ${todayAppointments === 1 ? 'atendimento' : 'atendimentos'} hoje`;

  return (
    <div className="ds-stack my-agenda" aria-label="Minha agenda">
      {selfOnly ? (
        <div className="professional-agenda-greeting">
          <span>Olá, {me.data?.publicName.split(' ')[0] ?? ''}</span>
          <strong>{todayLabel}</strong>
        </div>
      ) : <PageHeader
        eyebrow={
          me.data === undefined ? 'Agenda' : `Olá, ${me.data.publicName.split(' ')[0] ?? ''}`
        }
        title="Minha agenda"
        description="Seus atendimentos de hoje e os próximos."
        actions={
          canViewCalendar ? (
            <div className="segmented-control" role="group" aria-label="Visualização">
              <button
                type="button"
                className={view === 'agenda' ? 'active' : ''}
                aria-pressed={view === 'agenda'}
                onClick={() => {
                  setView('agenda');
                }}
              >
                Agenda
              </button>
              <button
                type="button"
                className={view === 'calendar' ? 'active' : ''}
                aria-pressed={view === 'calendar'}
                onClick={() => {
                  setView('calendar');
                }}
              >
                Calendário
              </button>
            </div>
          ) : undefined
        }
      />}

      {view === 'calendar' && canViewCalendar ? (
        <CalendarModule tenantPublicId={tenantPublicId} />
      ) : (
        <>
          <div className="my-agenda-daybar">
            <button
              className="icon-button"
              type="button"
              aria-label="Dia anterior"
              onClick={() => {
                setDate(addDays(date, -1));
              }}
            >
              <IconChevronLeft size={18} aria-hidden="true" />
            </button>
            <strong>{longDayLabel(date)}</strong>
            <button
              className="icon-button"
              type="button"
              aria-label="Próximo dia"
              onClick={() => {
                setDate(addDays(date, 1));
              }}
            >
              <IconChevronRight size={18} aria-hidden="true" />
            </button>
            <div className="my-agenda-daybar-modes">
              <button
                className="secondary-button button--sm"
                type="button"
                onClick={() => {
                  setDate(today());
                  setMode('day');
                }}
              >
                Hoje
              </button>
              <div className="segmented-control" role="group" aria-label="Modo">
                <button
                  type="button"
                  className={mode === 'day' ? 'active' : ''}
                  aria-pressed={mode === 'day'}
                  onClick={() => {
                    setMode('day');
                  }}
                >
                  Dia
                </button>
                <button
                  type="button"
                  className={mode === 'upcoming' ? 'active' : ''}
                  aria-pressed={mode === 'upcoming'}
                  onClick={() => {
                    setMode('upcoming');
                  }}
                >
                  Próximos
                </button>
              </div>
            </div>
          </div>

          <nav className="my-agenda-days" aria-label="Selecionar dia">
            {dayStrip.map((day) => (
              <button
                key={day}
                type="button"
                className={day === date ? 'is-active' : ''}
                aria-pressed={day === date}
                onClick={() => {
                  setDate(day);
                  setMode('day');
                }}
              >
                <small>{day === today() ? 'Hoje' : weekdayShort(day)}</small>
                <strong>{day.slice(8)}</strong>
                <span>{countsByDay.get(day) ?? 0}</span>
              </button>
            ))}
          </nav>

          {actionError !== undefined && (
            <p className="form-error" role="alert">
              {actionError instanceof HttpError
                ? actionError.message
                : 'Não foi possível concluir a ação.'}
            </p>
          )}

          {me.isPending || agenda.isPending ? (
            <ListSkeleton rows={4} />
          ) : agenda.error instanceof Error ? (
            <div className="ds-inline-alert ds-inline-alert--danger">
              <div>
                <strong>Não foi possível carregar sua agenda.</strong>
              </div>
              <button
                className="secondary-button button--sm"
                type="button"
                onClick={() => {
                  void agenda.refetch();
                }}
              >
                Tentar novamente
              </button>
            </div>
          ) : mode === 'upcoming' ? (
            <div className="my-agenda-upcoming">
              {upcoming.length === 0 ? (
                <EmptyState
                  icon={<IconCalendarOff size={22} />}
                  title="Nenhum atendimento nos próximos dias"
                  description="Assim que novos agendamentos chegarem eles aparecem aqui."
                />
              ) : (
                upcoming.map((group) => (
                  <SectionCard
                    key={group.key}
                    title={longDayLabel(group.key)}
                    description={`${String(group.items.length)} atendimento(s)`}
                  >
                    <ul className="my-agenda-upcoming-list">
                      {group.items.map((appointment) => (
                        <li key={appointment.publicId}>
                          <strong>{timeLabel(appointment.startsAt)}</strong>
                          <span>{appointment.customerName}</span>
                          <small>{appointment.serviceName}</small>
                        </li>
                      ))}
                    </ul>
                  </SectionCard>
                ))
              )}
            </div>
          ) : (
            <div className="my-agenda-layout">
              <div className="my-agenda-main">
                {next !== null && (
                  <MyAgendaNextCard
                    appointment={next}
                    paymentState={paymentStates.get(next.publicId)}
                    permissions={permissions}
                    handlers={handlers}
                    busy={busy}
                  />
                )}
                {timeline.length === 0 ? (
                  <EmptyState
                    icon={<IconCalendarOff size={22} />}
                    title="Você não possui atendimentos neste dia."
                    description="Nenhum horário livre foi encontrado para esta data."
                  />
                ) : (
                  <>
                    <MyAgendaTimeline
                      entries={timeline}
                      paymentStates={paymentStates}
                      permissions={permissions}
                      handlers={handlers}
                      busy={busy}
                      notesFor={notesFor}
                      notesSlot={notesSlot}
                      treatmentSlot={treatmentSlot}
                    />
                    {blocks.length > 0 && (
                      <p className="ds-form-hint">
                        Os horários livres são uma referência calculada para a duração de um
                        serviço seu. A disponibilidade final é recalculada ao escolher serviço e
                        profissional no novo agendamento.
                      </p>
                    )}
                  </>
                )}
              </div>
              <aside className="my-agenda-side" aria-label="Resumo do dia">
                <SectionCard title="Resumo do dia">
                  <dl className="my-agenda-summary">
                    <div>
                      <dt>Atendimentos</dt>
                      <dd>{dayItems.filter(isOpen).length}</dd>
                    </div>
                    <div>
                      <dt>Reservadas</dt>
                      <dd>{durationLabel(bookedMinutes)}</dd>
                    </div>
                    <div>
                      <dt>Livres (referência)</dt>
                      <dd>
                        {availability.error instanceof Error ? '—' : durationLabel(freeMinutes)}
                      </dd>
                    </div>
                    {next !== null && (
                      <div>
                        <dt>Próximo</dt>
                        <dd>{timeLabel(next.startsAt)}</dd>
                      </div>
                    )}
                  </dl>
                  {availability.error instanceof Error && (
                    <p className="ds-form-hint">
                      Os horários livres não puderam ser carregados. Seus atendimentos continuam
                      visíveis.
                    </p>
                  )}
                </SectionCard>
              </aside>
            </div>
          )}
        </>
      )}

      {completeTarget !== null && (
        <AgendaCompleteDialog
          tenantPublicId={tenantPublicId}
          target={completeTarget}
          canManagePayments={canManagePayments}
          mode={completeTarget.mode}
          onClose={() => {
            setCompleteTarget(null);
          }}
          onCompleted={() => {
            const { publicId, mode: dialogMode } = completeTarget;
            setCompleteTarget(null);
            if (dialogMode === 'complete') selfStatus.mutate({ publicId, status: 'completed' });
            else void invalidateAgenda();
          }}
        />
      )}
      {sessionPlan !== null && (
        /* Mesmo editor da agenda: só o plano vem pré-selecionado. */
        <AppointmentEditorDialog
          tenantPublicId={tenantPublicId}
          appointment={null}
          canFitIn={false}
          treatmentPlan={{
            publicId: sessionPlan.publicId,
            customerPublicId: sessionPlan.customerPublicId,
            servicePublicId: sessionPlan.servicePublicId,
            professionalPublicId: sessionPlan.professionalPublicId,
            sessionLabel:
              sessionPlan.sessionsPlanned === null
                ? `Sessão ${String(sessionPlan.sessions.length + 1)}`
                : `Sessão ${String(sessionPlan.sessions.length + 1)} de ${String(sessionPlan.sessionsPlanned)}`,
            recommendedNextDate: sessionPlan.recommendedNextDate,
          }}
          onClose={() => {
            setSessionPlan(null);
          }}
          onSaved={() => {
            setSessionPlan(null);
            void invalidateAgenda();
          }}
        />
      )}
      {confirmation !== null && (
        <ConfirmationDialog
          request={confirmation}
          onClose={() => {
            setConfirmation(null);
          }}
        />
      )}
    </div>
  );
}
