import { CUSTOMER_PASSWORD_RULES, servicePriceLabel } from '@plataforma/shared';
import { useEffect, useMemo, useRef, useState } from 'react';

import { environment } from '../../../config/environment.js';
import { AppointmentPaymentPanel } from '../../PublicBookingFlow.js';
import { DEMO_AVATAR } from '../demo-assets.js';
import { PushReminderCta } from '../PushReminderCta.js';
import { ServiceVisual } from '../ServiceVisual.js';
import {
  BOOKING_STEPS,
  dateFromIso,
  humanError,
  initialsOf,
  isoFromDate,
  usePublicBooking,
  type BookingStep,
  type PublicBookingEntry,
  type Site,
} from '../use-public-booking.js';

/** Etapas em que a seleção já avança sozinha e dispensam o botão de continuar. */
const SELF_ADVANCING_STEPS: BookingStep[] = ['service', 'professional', 'date', 'time'];

const weekday = (value: Date) =>
  value.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase();

/**
 * Apresentação "App Premium" do agendamento. Todas as regras vêm de
 * `usePublicBooking` — aqui só existe layout.
 */
export function PremiumBooking({
  slug,
  site,
  onFinish,
  initialEntry,
}: {
  slug: string;
  site: Site;
  onFinish: () => void;
  initialEntry?: PublicBookingEntry;
}) {
  const booking = usePublicBooking(slug, site, initialEntry);
  const {
    step,
    flow,
    goBack,
    continueFlow,
    validation,
    servicePublicId,
    selectServiceAndContinue,
    professionalPublicId,
    selectProfessionalAndContinue,
    professionals,
    professionalServices,
    selectedProfessional,
    date,
    selectDateAndContinue,
    selectedSlot,
    selectSlotAndContinue,
    availability,
    availableSlots,
    customerName,
    customerPhone,
    customerEmail,
    notes,
    changeCustomer,
    createAccount,
    setCreateAccount,
    accountPassword,
    setAccountPassword,
    accountError,
    accountCreated,
    canCreateAccount,
    paymentChoice,
    setPaymentChoice,
    needsPaymentChoice,
    onlineAvailable,
    payOnline,
    unitPublicId,
    setUnitPublicId,
  } = booking;
  const stepBodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stepBodyRef.current?.focus({ preventScroll: true });
    stepBodyRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [step]);

  const days = useMemo(
    () =>
      Array.from({ length: 21 }, (_, index) => {
        const next = new Date();
        next.setHours(12, 0, 0, 0);
        next.setDate(next.getDate() + index);
        return next;
      }),
    [],
  );
  const todayIso = isoFromDate(new Date());
  const [monthOffset, setMonthOffset] = useState(0);
  const visibleMonth = useMemo(() => {
    const base = dateFromIso(date);
    return new Date(base.getFullYear(), base.getMonth() + monthOffset, 1, 12);
  }, [date, monthOffset]);
  // Calendário compacto sobre o mesmo estado de data; nenhuma regra nova.
  const monthDays = useMemo(() => {
    const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1, 12);
    const total = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0, 12).getDate();
    return [
      ...Array.from<null>({ length: first.getDay() }).fill(null),
      ...Array.from({ length: total }, (_, index) =>
        new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index + 1, 12),
      ),
    ];
  }, [visibleMonth]);
  const canGoPreviousMonth =
    new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1, 12).getTime() >
    new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12).getTime();
  const service = site.services.find((item) => item.publicId === servicePublicId);
  const index = flow.indexOf(step);
  const title = BOOKING_STEPS.find((item) => item.id === step)?.label ?? '';
  const headings: Record<string, { title: string; subtitle: string }> = {
    // O título usa a terminologia do tenant como substantivo, sem artigo, para
    // funcionar com qualquer termo configurado.
    service: {
      title: site.terminology.service.singular,
      subtitle: 'Selecione o atendimento desejado.',
    },
    professional: {
      title: site.terminology.professional.singular,
      subtitle: 'Veja quem está disponível.',
    },
    date: { title: 'Escolha a data', subtitle: 'Selecione o melhor dia.' },
    time: {
      title: 'Escolha o horário',
      subtitle: dateFromIso(date).toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    },
    customer: { title: 'Seus dados', subtitle: 'Precisamos de um contato para confirmar.' },
    payment: { title: 'Como você prefere pagar?', subtitle: 'Escolha a forma de pagamento.' },
    review: { title: 'Revise seu agendamento', subtitle: 'Confira os detalhes antes de confirmar.' },
  };

  if (booking.booking.isSuccess) {
    const confirmation = booking.booking.data;
    return (
      <section className="premium-confirmation" aria-live="polite">
        <span className="premium-confirmation-icon" aria-hidden="true">
          ✓
        </span>
        <h2>Agendamento confirmado</h2>
        <p>
          {new Date(confirmation.startsAt).toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
          {` às ${new Date(confirmation.startsAt).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })}`}
        </p>
        <dl className="premium-review-card">
          <div>
            <dt>{site.terminology.service.singular}</dt>
            <dd>{confirmation.serviceName}</dd>
          </div>
          <div>
            <dt>{site.terminology.professional.singular}</dt>
            <dd>{confirmation.professionalName}</dd>
          </div>
          {confirmation.unitName === null ? null : (
            <div>
              <dt>Local</dt>
              <dd>{confirmation.unitName}</dd>
            </div>
          )}
          <div>
            <dt>Protocolo</dt>
            <dd>{confirmation.protocol}</dd>
          </div>
        </dl>
        {accountError !== null ? (
          <p className="premium-inline-error" role="alert">
            {accountError}
          </p>
        ) : null}
        {accountCreated ? (
          <p className="premium-inline-note">
            Sua conta foi criada. Use o avatar no topo para acompanhar seus agendamentos.
          </p>
        ) : null}
        {onlineAvailable ? (
          <AppointmentPaymentPanel
            slug={slug}
            appointmentPublicId={confirmation.appointmentPublicId}
            mode={payOnline ? 'required' : 'reminder'}
          />
        ) : null}
        <PushReminderCta slug={slug} />
        <button className="premium-primary" type="button" onClick={onFinish}>
          Voltar ao início
        </button>
      </section>
    );
  }

  if (site.bookingAvailable === false)
    return (
      <section className="premium-empty">
        <strong>Agendamento online indisponível</strong>
        <p>
          {site.unavailableMessage ?? 'Entre em contato com o estabelecimento para mais informações.'}
        </p>
      </section>
    );

  return (
    <section className="premium-booking-shell">
      <header className="premium-step-header">
        <button
          className="premium-back"
          type="button"
          aria-label="Voltar"
          onClick={index === 0 ? onFinish : goBack}
        >
          ←
        </button>
        <div>
          <h2>{headings[step]?.title ?? title}</h2>
          <p>{headings[step]?.subtitle}</p>
        </div>
      </header>
      <div className="premium-progress" aria-label={`Etapa ${String(index + 1)} de ${String(flow.length)}`}>
        {flow.map((id, position) => (
          <i key={id} className={position <= index ? 'is-done' : ''} />
        ))}
      </div>

      <div ref={stepBodyRef} className="premium-step-body" tabIndex={-1}>
        {step === 'service' ? (
          <>
            {site.units.length > 1 ? (
              <div className="premium-unit-row">
                {site.units.map((unit) => (
                  <button
                    key={unit.publicId}
                    className={`premium-chip${unitPublicId === unit.publicId ? ' is-selected' : ''}`}
                    type="button"
                    aria-pressed={unitPublicId === unit.publicId}
                    onClick={() => {
                      setUnitPublicId(unit.publicId);
                    }}
                  >
                    {unit.name}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="premium-pick-list">
              {(initialEntry?.type === 'PROFESSIONAL' && professionalPublicId !== ''
                ? professionalServices.data?.services ?? []
                : site.services
              ).map((item) => (
                <button
                  key={item.publicId}
                  className={`premium-pick${servicePublicId === item.publicId ? ' is-selected' : ''}`}
                  type="button"
                  aria-pressed={servicePublicId === item.publicId}
                  onClick={() => {
                    selectServiceAndContinue(item.publicId);
                  }}
                >
                  <ServiceVisual
                    name={item.name}
                    imageUrl={item.imageUrl}
                    iconKey={item.iconKey}
                  />
                  <span className="premium-pick-body">
                    <strong>{item.name}</strong>
                    <small>
                      {servicePriceLabel(item.pricingMode, item.priceCents, item.quoteNotice)}
                      {` · ${String(item.durationMinutes)} min`}
                    </small>
                  </span>
                  <span className="premium-pick-check" aria-hidden="true">
                    ✓
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : null}

        {step === 'professional' ? (
          professionals.isPending ? (
            <div className="premium-pick-list">
              {[1, 2, 3].map((item) => (
                <div key={item} className="premium-skeleton" />
              ))}
            </div>
          ) : professionals.isError ? (
            <div className="premium-empty">
              <strong>Não foi possível carregar a equipe</strong>
              <p>Volte e selecione o serviço novamente.</p>
            </div>
          ) : (
            <div className="premium-pick-list">
              {professionals.data.professionals.map((item) => (
                <button
                  key={item.publicId}
                  className={`premium-pick${professionalPublicId === item.publicId ? ' is-selected' : ''}`}
                  type="button"
                  aria-pressed={professionalPublicId === item.publicId}
                  onClick={() => {
                    selectProfessionalAndContinue(item.publicId);
                  }}
                >
                  <span className="premium-pick-avatar">
                    <b>{initialsOf(item.name)}</b>
                    <img
                      alt=""
                      src={
                        item.photoUrl === null
                          ? DEMO_AVATAR
                          : `${environment.apiUrl}${item.photoUrl}`
                      }
                      onError={(event) => {
                        event.currentTarget.style.display = 'none';
                      }}
                    />
                  </span>
                  <span className="premium-pick-body">
                    <strong>{item.name}</strong>
                    {item.bio === null ? null : <small>{item.bio}</small>}
                  </span>
                  <span className="premium-pick-check" aria-hidden="true">
                    ✓
                  </span>
                </button>
              ))}
            </div>
          )
        ) : null}

        {step === 'date' ? (
          <>
            <div className="premium-day-strip" role="list">
              {days.map((day) => {
                const value = isoFromDate(day);
                return (
                  <button
                    key={value}
                    className={`premium-day${date === value ? ' is-selected' : ''}`}
                    type="button"
                    aria-pressed={date === value}
                    onClick={() => {
                      selectDateAndContinue(value);
                    }}
                  >
                    <small>{weekday(day)}</small>
                    <strong>{day.getDate()}</strong>
                    <small>
                      {day.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}
                    </small>
                  </button>
                );
              })}
            </div>
            <div className="premium-calendar">
              <header>
                <button
                  type="button"
                  aria-label="Mês anterior"
                  disabled={!canGoPreviousMonth}
                  onClick={() => {
                    setMonthOffset((value) => value - 1);
                  }}
                >
                  ‹
                </button>
                <strong>
                  {visibleMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                </strong>
                <button
                  type="button"
                  aria-label="Próximo mês"
                  onClick={() => {
                    setMonthOffset((value) => value + 1);
                  }}
                >
                  ›
                </button>
              </header>
              <div className="premium-calendar-weekdays" aria-hidden="true">
                {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((label, position) => (
                  <span key={`${label}-${String(position)}`}>{label}</span>
                ))}
              </div>
              <div className="premium-calendar-grid" role="grid">
                {monthDays.map((day, position) =>
                  day === null ? (
                    <span key={`empty-${String(position)}`} />
                  ) : (
                    <button
                      key={isoFromDate(day)}
                      className={`premium-calendar-day${
                        date === isoFromDate(day) ? ' is-selected' : ''
                      }${isoFromDate(day) === todayIso ? ' is-today' : ''}`}
                      type="button"
                      role="gridcell"
                      aria-pressed={date === isoFromDate(day)}
                      disabled={isoFromDate(day) < todayIso}
                      onClick={() => {
                        selectDateAndContinue(isoFromDate(day));
                      }}
                    >
                      {day.getDate()}
                    </button>
                  ),
                )}
              </div>
            </div>
          </>
        ) : null}

        {step === 'time' ? (
          availability.isPending ? (
            <div className="premium-slot-grid">
              {Array.from({ length: 8 }, (_, item) => (
                <div key={item} className="premium-skeleton premium-skeleton--slot" />
              ))}
            </div>
          ) : availability.isError ? (
            <div className="premium-empty">
              <strong>Não foi possível consultar os horários</strong>
              <p>Escolha a data novamente.</p>
            </div>
          ) : availableSlots.length === 0 ? (
            <div className="premium-empty">
              <strong>Sem horários neste dia</strong>
              <p>Volte e escolha outra data.</p>
            </div>
          ) : (
            [
              { label: 'Manhã', max: 12 },
              { label: 'Tarde', max: 18 },
              { label: 'Noite', max: 24 },
            ].map(({ label, max }) => {
              const slots = availableSlots.filter((slot) => {
                const hour = new Date(slot.startsAt).getHours();
                return hour < max && hour >= max - (max === 12 ? 12 : 6);
              });
              if (slots.length === 0) return null;
              return (
                <div key={label} className="premium-slot-period">
                  <p>{label}</p>
                  <div className="premium-slot-grid">
                    {slots.map((slot) => (
                      <button
                        key={slot.startsAt}
                        className={`premium-slot${selectedSlot === slot.startsAt ? ' is-selected' : ''}`}
                        type="button"
                        aria-pressed={selectedSlot === slot.startsAt}
                        onClick={() => {
                          selectSlotAndContinue(slot.startsAt);
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
              );
            })
          )
        ) : null}

        {step === 'customer' ? (
          <div className="premium-form">
            <label>
              <span>Seu nome</span>
              <input
                autoComplete="name"
                value={customerName}
                onChange={(event) => {
                  changeCustomer('name', event.target.value);
                }}
              />
            </label>
            <label>
              <span>WhatsApp ou telefone</span>
              <input
                autoComplete="tel"
                inputMode="tel"
                value={customerPhone}
                onChange={(event) => {
                  changeCustomer('phone', event.target.value);
                }}
              />
            </label>
            <label>
              <span>E-mail</span>
              <input
                autoComplete="email"
                inputMode="email"
                type="email"
                value={customerEmail}
                onChange={(event) => {
                  changeCustomer('email', event.target.value);
                }}
              />
              <small>Informe telefone ou e-mail.</small>
            </label>
            <label>
              <span>Observações</span>
              <textarea
                rows={3}
                maxLength={2000}
                value={notes}
                onChange={(event) => {
                  changeCustomer('notes', event.target.value);
                }}
              />
            </label>
            {canCreateAccount ? (
              <div className="premium-account-optin">
                <label className="premium-checkbox">
                  <input
                    type="checkbox"
                    checked={createAccount}
                    onChange={(event) => {
                      setCreateAccount(event.target.checked);
                    }}
                  />
                  <span>Quero criar uma conta para acompanhar meus agendamentos</span>
                </label>
                {createAccount ? (
                  <label>
                    <span>Senha</span>
                    <input
                      autoComplete="new-password"
                      type="password"
                      value={accountPassword}
                      onChange={(event) => {
                        setAccountPassword(event.target.value);
                      }}
                    />
                    <ul className="premium-rules">
                      {CUSTOMER_PASSWORD_RULES.map((rule) => (
                        <li key={rule}>{rule}</li>
                      ))}
                    </ul>
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 'payment' ? (
          <div className="premium-pick-list">
            <button
              className={`premium-pick premium-pick--payment${paymentChoice === 'online' ? ' is-selected' : ''}`}
              type="button"
              aria-pressed={paymentChoice === 'online'}
              onClick={() => {
                setPaymentChoice('online');
              }}
            >
              <span className="premium-pick-body">
                <strong>Pagar agora online</strong>
                <small>Seguro e rápido.</small>
              </span>
              <span className="premium-pick-check" aria-hidden="true">
                ✓
              </span>
            </button>
            <button
              className={`premium-pick premium-pick--payment${paymentChoice === 'local' ? ' is-selected' : ''}`}
              type="button"
              aria-pressed={paymentChoice === 'local'}
              onClick={() => {
                setPaymentChoice('local');
              }}
            >
              <span className="premium-pick-body">
                <strong>Pagar no atendimento</strong>
                <small>Você paga diretamente no estabelecimento.</small>
              </span>
              <span className="premium-pick-check" aria-hidden="true">
                ✓
              </span>
            </button>
          </div>
        ) : null}

        {step === 'review' ? (
          <dl className="premium-review-card">
            {service === undefined ? null : (
              <>
                <div>
                  <dt>{site.terminology.service.singular}</dt>
                  <dd>{service.name}</dd>
                </div>
                <div>
                  <dt>Valor</dt>
                  <dd>{servicePriceLabel(service.pricingMode, service.priceCents, service.quoteNotice)}</dd>
                </div>
                <div>
                  <dt>Duração aproximada</dt>
                  <dd>{service.durationMinutes} min</dd>
                </div>
              </>
            )}
            {selectedProfessional === undefined ? null : (
              <div>
                <dt>{site.terminology.professional.singular}</dt>
                <dd>{selectedProfessional.name}</dd>
              </div>
            )}
            <div>
              <dt>Data</dt>
              <dd>
                {dateFromIso(date).toLocaleDateString('pt-BR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </dd>
            </div>
            {selectedSlot === null ? null : (
              <div>
                <dt>Horário</dt>
                <dd>
                  {new Date(selectedSlot).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </dd>
              </div>
            )}
            <div>
              <dt>Agendamento para</dt>
              <dd>{customerName}</dd>
            </div>
            {needsPaymentChoice && paymentChoice !== null ? (
              <div>
                <dt>Pagamento</dt>
                <dd>{paymentChoice === 'online' ? 'Online, após confirmar' : 'No atendimento'}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {validation !== null ? (
          <p className="premium-inline-error" role="alert">
            {validation}
          </p>
        ) : null}
        {booking.booking.isError ? (
          <p className="premium-inline-error" role="alert">
            {humanError(booking.booking.error)}
          </p>
        ) : null}
      </div>

      {SELF_ADVANCING_STEPS.includes(step) ? null : <div className="premium-step-cta">
        <button
          className="premium-primary"
          type="button"
          disabled={booking.booking.isPending || (step === 'time' && availability.isPending)}
          onClick={continueFlow}
        >
          {booking.booking.isPending
            ? 'Confirmando…'
            : step === 'review'
              ? 'Confirmar agendamento'
              : 'Avançar'}
        </button>
      </div>}
    </section>
  );
}
