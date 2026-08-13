import {
  AppointmentPaymentOptionsResponseSchema,
  CUSTOMER_PASSWORD_RULES,
  PaymentGatewayChargePublicSchema,
  PixChargeResponseSchema,
} from '@plataforma/shared';
import { IconCreditCard, IconQrcode } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { type z } from 'zod';

import {
  BOOKING_STEPS as steps,
  centsToBrl,
  dateFromIso,
  humanError,
  initialsOf,
  isoFromDate,
  todayIsoDate,
  usePublicBooking,
  type BookingProfessional as Professional,
  type BookingStep as Step,
  type Site,
} from './public/use-public-booking.js';
import { environment } from '../config/environment.js';
import { httpClient, HttpError } from '../lib/http.js';






function BookingProgress({ step, flow }: { step: Step; flow: Step[] }) {
  const activeIndex = flow.indexOf(step);
  const label = steps.find((item) => item.id === step)?.label;
  return (
    <nav className="booking-progress" aria-label="Progresso do agendamento">
      <span>{`Etapa ${String(activeIndex + 1)} de ${String(flow.length)}`}</span>
      <div className="booking-progress-track" aria-hidden="true">
        <i style={{ width: `${String(((activeIndex + 1) / flow.length) * 100)}%` }} />
      </div>
      <strong>{label}</strong>
    </nav>
  );
}

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="booking-step-header">
      <h3>{title}</h3>
      <p>{subtitle}</p>
    </header>
  );
}

function ServiceStep({
  site,
  selected,
  onSelect,
}: {
  site: Site;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const services = site.services.filter((service) =>
    `${service.name} ${service.description ?? ''}`
      .toLocaleLowerCase('pt-BR')
      .includes(search.trim().toLocaleLowerCase('pt-BR')),
  );
  return (
    <section className="booking-step">
      <StepHeader
        title={`Escolha ${site.terminology.service.singular.toLocaleLowerCase('pt-BR')}`}
        subtitle="Selecione o atendimento que você deseja."
      />
      {site.services.length > 8 ? (
        <label className="booking-search">
          <span>Buscar serviço</span>
          <input
            type="search"
            value={search}
            placeholder="Digite o nome do serviço"
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        </label>
      ) : null}
      <div className="booking-card-grid booking-service-grid">
        {services.map((service) => (
          <button
            key={service.publicId}
            type="button"
            className="booking-choice-card"
            aria-pressed={selected === service.publicId}
            onClick={() => {
              onSelect(service.publicId);
            }}
          >
            {service.imageUrl === null ? null : (
              <img src={`${environment.apiUrl}${service.imageUrl}`} alt="" />
            )}
            <span className="booking-choice-content">
              <strong>{service.name}</strong>
              {service.description === null ? null : <small>{service.description}</small>}
              <span className="booking-choice-meta">
                <b>{centsToBrl(service.priceCents)}</b>
                <span>{`${String(service.durationMinutes)} min`}</span>
              </span>
            </span>
            <i aria-hidden="true">✓</i>
          </button>
        ))}
      </div>
      {services.length === 0 ? (
        <div className="booking-empty">
          <strong>Nenhum serviço encontrado</strong>
          <span>Tente buscar por outro termo.</span>
        </div>
      ) : null}
    </section>
  );
}

function ProfessionalStep({
  site,
  professionals,
  selected,
  loading,
  error,
  onSelect,
}: {
  site: Site;
  professionals: Professional[];
  selected: string;
  loading: boolean;
  error: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="booking-step">
      <StepHeader
        title={`Com quem você quer ser atendido?`}
        subtitle={`Escolha ${site.terminology.professional.singular.toLocaleLowerCase('pt-BR')}.`}
      />
      {loading ? (
        <div className="booking-card-grid">
          {[1, 2, 3].map((item) => (
            <div className="booking-skeleton booking-professional-skeleton" key={item} />
          ))}
        </div>
      ) : null}
      {error ? (
        <div className="booking-empty booking-error" role="alert">
          <strong>Não foi possível carregar a equipe</strong>
          <span>Volte e selecione o serviço novamente.</span>
        </div>
      ) : null}
      {!loading && !error ? (
        <div className="booking-card-grid">
          {professionals.map((professional) => (
            <button
              key={professional.publicId}
              type="button"
              className="booking-choice-card booking-professional-card"
              aria-pressed={selected === professional.publicId}
              onClick={() => {
                onSelect(professional.publicId);
              }}
            >
              {professional.photoUrl === null ? (
                <span className="booking-avatar-fallback" aria-hidden="true">
                  {initialsOf(professional.name)}
                </span>
              ) : (
                <img src={`${environment.apiUrl}${professional.photoUrl}`} alt="" />
              )}
              <span className="booking-choice-content">
                <strong>{professional.name}</strong>
                {professional.bio === null ? null : <small>{professional.bio}</small>}
              </span>
              <i aria-hidden="true">✓</i>
            </button>
          ))}
        </div>
      ) : null}
      {!loading && !error && professionals.length === 0 ? (
        <div className="booking-empty">
          <strong>Nenhum profissional disponível</strong>
          <span>Escolha outro serviço para continuar.</span>
        </div>
      ) : null}
    </section>
  );
}

function DateStep({ date, onSelect }: { date: string; onSelect: (date: string) => void }) {
  const dates = useMemo(
    () =>
      Array.from({ length: 21 }, (_, index) => {
        const next = new Date();
        next.setHours(12, 0, 0, 0);
        next.setDate(next.getDate() + index);
        return next;
      }),
    [],
  );
  return (
    <section className="booking-step">
      <StepHeader
        title="Escolha a data"
        subtitle="Consulte os próximos dias e encontre o melhor para você."
      />
      <div className="booking-month-label">
        {dateFromIso(date).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
      </div>
      <div className="booking-date-strip" role="list" aria-label="Próximas datas">
        {dates.map((item) => {
          const value = isoFromDate(item);
          return (
            <button
              key={value}
              type="button"
              aria-pressed={date === value}
              onClick={() => {
                onSelect(value);
              }}
            >
              <span>{item.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</span>
              <strong>{item.getDate()}</strong>
              <small>{item.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</small>
            </button>
          );
        })}
      </div>
      <details className="booking-calendar-disclosure">
        <summary>Ver calendário</summary>
        <label>
          <span>Escolha outra data</span>
          <input
            type="date"
            min={todayIsoDate()}
            value={date}
            onChange={(event) => {
              onSelect(event.target.value);
            }}
          />
        </label>
      </details>
      <p className="booking-helper">
        A disponibilidade real será consultada depois que você escolher a data.
      </p>
    </section>
  );
}

function TimeStep({
  slots,
  selected,
  loading,
  error,
  onSelect,
}: {
  slots: { startsAt: string }[];
  selected: string | null;
  loading: boolean;
  error: boolean;
  onSelect: (slot: string) => void;
}) {
  const periods = [
    { label: 'Manhã', slots: slots.filter((slot) => new Date(slot.startsAt).getHours() < 12) },
    {
      label: 'Tarde',
      slots: slots.filter((slot) => {
        const hour = new Date(slot.startsAt).getHours();
        return hour >= 12 && hour < 18;
      }),
    },
    { label: 'Noite', slots: slots.filter((slot) => new Date(slot.startsAt).getHours() >= 18) },
  ].filter((period) => period.slots.length > 0);
  return (
    <section className="booking-step">
      <StepHeader
        title="Horários disponíveis"
        subtitle="Os horários abaixo respeitam a agenda real do profissional."
      />
      {loading ? (
        <div className="booking-slot-skeleton">
          {Array.from({ length: 8 }, (_, index) => (
            <i key={index} />
          ))}
        </div>
      ) : null}
      {error ? (
        <div className="booking-empty booking-error" role="alert">
          <strong>Não foi possível consultar os horários</strong>
          <span>Tente escolher a data novamente.</span>
        </div>
      ) : null}
      {!loading &&
        !error &&
        periods.map((period) => (
          <div className="booking-period" key={period.label}>
            <h4>{period.label}</h4>
            <div className="booking-slot-grid">
              {period.slots.map((slot) => (
                <button
                  key={slot.startsAt}
                  type="button"
                  aria-pressed={selected === slot.startsAt}
                  onClick={() => {
                    onSelect(slot.startsAt);
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
        ))}
      {!loading && !error && slots.length === 0 ? (
        <div className="booking-empty">
          <strong>Não encontramos horários disponíveis neste dia.</strong>
          <span>Escolha outra data para continuar.</span>
        </div>
      ) : null}
    </section>
  );
}

function CustomerStep({
  name,
  phone,
  email,
  notes,
  createAccount,
  accountPassword,
  canCreateAccount,
  onChange,
  onToggleAccount,
  onPasswordChange,
}: {
  name: string;
  phone: string;
  email: string;
  notes: string;
  createAccount: boolean;
  accountPassword: string;
  canCreateAccount: boolean;
  onChange: (field: 'name' | 'phone' | 'email' | 'notes', value: string) => void;
  onToggleAccount: (value: boolean) => void;
  onPasswordChange: (value: string) => void;
}) {
  return (
    <section className="booking-step">
      <StepHeader
        title="Agora, seus dados"
        subtitle="Precisamos de um contato para confirmar o agendamento."
      />
      <div className="booking-customer-form">
        <label>
          <span>Seu nome</span>
          <input
            autoComplete="name"
            required
            value={name}
            onChange={(event) => {
              onChange('name', event.target.value);
            }}
          />
        </label>
        <label>
          <span>WhatsApp ou telefone</span>
          <input
            autoComplete="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => {
              onChange('phone', event.target.value);
            }}
          />
          <small>Informe telefone ou e-mail.</small>
        </label>
        <label>
          <span>
            E-mail <em>opcional se informar telefone</em>
          </span>
          <input
            autoComplete="email"
            inputMode="email"
            type="email"
            value={email}
            onChange={(event) => {
              onChange('email', event.target.value);
            }}
          />
        </label>
        <label>
          <span>
            Observações <em>opcional</em>
          </span>
          <textarea
            rows={3}
            maxLength={2000}
            value={notes}
            onChange={(event) => {
              onChange('notes', event.target.value);
            }}
          />
        </label>
      </div>
      {canCreateAccount ? (
        <div className="booking-account-optin">
          <label className="booking-checkbox">
            <input
              type="checkbox"
              checked={createAccount}
              onChange={(event) => {
                onToggleAccount(event.target.checked);
              }}
            />
            <span>Quero criar uma conta para acompanhar meus agendamentos</span>
          </label>
          <p className="booking-helper">
            Com uma conta você acompanha seus horários e pagamentos sem preencher seus dados
            novamente.
          </p>
          {createAccount ? (
            <label>
              <span>Senha</span>
              <input
                autoComplete="new-password"
                type="password"
                value={accountPassword}
                onChange={(event) => {
                  onPasswordChange(event.target.value);
                }}
              />
              <ul className="booking-password-rules">
                {CUSTOMER_PASSWORD_RULES.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </label>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Etapa exibida somente quando existe escolha real entre online e presencial. */
function PaymentChoiceStep({
  choice,
  onSelect,
}: {
  choice: 'online' | 'local' | null;
  onSelect: (value: 'online' | 'local') => void;
}) {
  return (
    <section className="booking-step">
      <StepHeader
        title="Como você prefere pagar?"
        subtitle="Você pode pagar agora ou diretamente no atendimento."
      />
      <div className="booking-card-grid">
        <button
          type="button"
          className="booking-choice-card booking-payment-choice"
          aria-pressed={choice === 'online'}
          onClick={() => {
            onSelect('online');
          }}
        >
          <span className="booking-choice-content">
            <strong>Pagar agora online</strong>
            <small>Seguro e rápido.</small>
          </span>
          <i aria-hidden="true">✓</i>
        </button>
        <button
          type="button"
          className="booking-choice-card booking-payment-choice"
          aria-pressed={choice === 'local'}
          onClick={() => {
            onSelect('local');
          }}
        >
          <span className="booking-choice-content">
            <strong>Pagar no atendimento</strong>
            <small>Você paga diretamente no estabelecimento.</small>
          </span>
          <i aria-hidden="true">✓</i>
        </button>
      </div>
    </section>
  );
}

function BookingSummary({
  site,
  serviceId,
  professional,
  unitPublicId,
  date,
  slot,
  compact = false,
}: {
  site: Site;
  serviceId: string;
  professional: Professional | undefined;
  unitPublicId: string;
  date: string;
  slot: string | null;
  compact?: boolean;
}) {
  const service = site.services.find((item) => item.publicId === serviceId);
  const unit = site.units.find((item) => item.publicId === unitPublicId);
  return (
    <aside
      className={compact ? 'booking-summary booking-summary-compact' : 'booking-summary'}
      aria-label="Resumo do agendamento"
    >
      <h3>Seu agendamento</h3>
      <dl>
        {service === undefined ? null : (
          <>
            <div>
              <dt>Serviço</dt>
              <dd>{service.name}</dd>
            </div>
            <div>
              <dt>Valor</dt>
              <dd>{centsToBrl(service.priceCents)}</dd>
            </div>
          </>
        )}
        {professional === undefined ? null : (
          <div>
            <dt>Profissional</dt>
            <dd>{professional.name}</dd>
          </div>
        )}
        {date === '' ? null : (
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
        )}
        {slot === null ? null : (
          <div>
            <dt>Horário</dt>
            <dd>
              {new Date(slot).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </dd>
          </div>
        )}
        {unit !== undefined ? (
          <div>
            <dt>Local</dt>
            <dd>{unit.name}</dd>
          </div>
        ) : null}
      </dl>
    </aside>
  );
}

/**
 * Cobrança online do agendamento já criado. Reutiliza os endpoints de cobrança
 * existentes; `mode` só muda a apresentação (obrigatória ou lembrete discreto).
 */
export function AppointmentPaymentPanel({
  slug,
  appointmentPublicId,
  mode,
}: {
  slug: string;
  appointmentPublicId: string;
  mode: 'required' | 'reminder';
}) {
  const [pixCharge, setPixCharge] = useState<z.infer<typeof PixChargeResponseSchema> | null>(null);
  const [mpCharge, setMpCharge] = useState<z.infer<typeof PaymentGatewayChargePublicSchema> | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const options = useQuery({
    queryKey: ['public-booking', slug, 'payment-options', appointmentPublicId],
    queryFn: () =>
      httpClient.request(
        `/public/sites/${slug}/appointments/${appointmentPublicId}/payment-options`,
        { schema: AppointmentPaymentOptionsResponseSchema },
      ),
    retry: false,
  });
  const kind = options.data?.depositRequired === true ? 'DEPOSIT' : 'PAYMENT';
  const createPix = useMutation({
    mutationFn: () =>
      httpClient.request(
        `/public/sites/${slug}/appointments/${appointmentPublicId}/pix-local-charges`,
        { method: 'POST', body: { kind }, schema: PixChargeResponseSchema },
      ),
    onSuccess: setPixCharge,
  });
  const createMercadoPago = useMutation({
    mutationFn: () =>
      httpClient.request(
        `/public/sites/${slug}/appointments/${appointmentPublicId}/mercadopago-charges`,
        { method: 'POST', body: { kind }, schema: PaymentGatewayChargePublicSchema },
      ),
    onSuccess: setMpCharge,
  });
  if (options.isPending)
    return (
      <div
        className="booking-payment booking-skeleton"
        aria-label="Carregando opções de pagamento"
      />
    );
  if (options.data === undefined) return null;
  if (pixCharge !== null || mpCharge !== null) {
    const charge = pixCharge?.charge ?? mpCharge;
    const code = pixCharge?.charge.pixCopyPaste ?? mpCharge?.pixCopyPaste;
    return (
      <section className="booking-payment payment-panel">
        <header className="payment-panel-header">
          <strong>{pixCharge === null ? 'Pagamento online' : 'Pagamento via PIX'}</strong>
          <span className="payment-panel-amount">
            {charge === null ? null : centsToBrl(charge.amountCents)}
          </span>
          <small>Valor a pagar</small>
        </header>
        {pixCharge?.qrCodeDataUrl ? (
          <figure className="payment-qr">
            <img src={pixCharge.qrCodeDataUrl} alt="QR Code do PIX" />
            <figcaption>Escaneie o QR Code ou copie o código abaixo.</figcaption>
          </figure>
        ) : null}
        {code ? (
          <div className="payment-code">
            <code>{code}</code>
            <button
              className="payment-copy"
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(code).then(() => {
                  setCopied(true);
                  window.setTimeout(() => {
                    setCopied(false);
                  }, 2500);
                });
              }}
            >
              {copied ? 'Código copiado' : 'Copiar código'}
            </button>
          </div>
        ) : null}
        <p className="payment-status" role="status">
          Aguardando pagamento. O estabelecimento confirma o recebimento.
        </p>
      </section>
    );
  }
  const data = options.data;
  if (!data.pixLocalAvailable && !data.mercadoPagoAvailable) return null;
  // Nada em aberto: não oferecer pagamento novamente.
  if (!data.depositRequired && Number(data.balanceCents) <= 0)
    return mode === 'required' ? (
      <section className="booking-payment">
        <strong>Pagamento concluído</strong>
        <p>Não há valor pendente para este agendamento.</p>
      </section>
    ) : null;
  const methods = [
    data.pixLocalAvailable
      ? {
          id: 'pix',
          label: 'PIX',
          hint: 'Copia e cola ou QR Code.',
          busy: createPix.isPending,
          run: () => {
            createPix.mutate();
          },
        }
      : null,
    data.mercadoPagoAvailable
      ? {
          id: 'mercadopago',
          label: 'Mercado Pago',
          hint: 'Pagamento pelo Mercado Pago.',
          busy: createMercadoPago.isPending,
          run: () => {
            createMercadoPago.mutate();
          },
        }
      : null,
  ].filter((method) => method !== null);
  return (
    <section className={`booking-payment${mode === 'reminder' ? ' is-reminder' : ''}`}>
      <strong>
        {mode === 'reminder'
          ? 'Prefere adiantar o pagamento?'
          : data.depositRequired
            ? 'Este agendamento exige um sinal'
            : 'Pagamento online'}
      </strong>
      <p>
        {mode === 'reminder'
          ? 'Seu horário está confirmado para pagamento no atendimento. Se preferir, pague online agora.'
          : `Valor: ${centsToBrl(data.depositRequired ? (data.depositAmountCents ?? data.balanceCents) : data.balanceCents)}`}
      </p>
      <div className="booking-payment-methods">
        {methods.map((method) => (
          <button
            key={method.id}
            type="button"
            className="booking-payment-method payment-cta"
            disabled={method.busy}
            onClick={method.run}
          >
            <span className="payment-cta-icon" aria-hidden="true">
              {method.id === 'pix' ? <IconQrcode size={22} stroke={1.8} /> : <IconCreditCard size={22} stroke={1.8} />}
            </span>
            <span className="payment-cta-body">
              <strong>
                {method.busy
                  ? 'Gerando cobrança…'
                  : methods.length === 1 && mode === 'reminder'
                    ? 'Pagar online agora'
                    : `Pagar com ${method.label}`}
              </strong>
              <small>{method.hint}</small>
            </span>
            <span className="payment-cta-arrow" aria-hidden="true">
              ›
            </span>
          </button>
        ))}
      </div>
      {createPix.error instanceof Error || createMercadoPago.error instanceof Error ? (
        <p className="booking-inline-error" role="alert">
          Não foi possível iniciar o pagamento agora. Tente novamente.
        </p>
      ) : null}
    </section>
  );
}

export function PublicBookingFlow({ slug, site }: { slug: string; site: Site }) {
  // Toda a lógica vem do hook; aqui só existe a apresentação Clássica.
  const {
    step,
    setStep,
    flow,
    goBack,
    continueFlow,
    validation,
    unitPublicId,
    setUnitPublicId,
    servicePublicId,
    selectService,
    professionalPublicId,
    selectProfessional,
    professionals,
    selectedProfessional,
    date,
    selectDate,
    selectedSlot,
    setSelectedSlot,
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
    booking,
  } = usePublicBooking(slug, site);

  if (booking.isSuccess) {
    const confirmation = booking.data;
    return (
      <section className="booking-success" aria-live="polite">
        <span className="booking-success-icon" aria-hidden="true">
          ✓
        </span>
        <p>Horário reservado</p>
        <h2>Agendamento confirmado!</h2>
        <strong>
          {new Date(confirmation.startsAt).toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </strong>
        <span>{`às ${new Date(confirmation.startsAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}</span>
        <div className="booking-success-card">
          <b>{confirmation.serviceName}</b>
          <span>{`com ${confirmation.professionalName}`}</span>
          {confirmation.unitName === null ? null : <span>{confirmation.unitName}</span>}
        </div>
        <small>
          Protocolo: <strong>{confirmation.protocol}</strong>
        </small>
        {accountError !== null ? (
          <p className="booking-inline-error" role="alert">
            {accountError}
          </p>
        ) : null}
        {accountCreated ? (
          <p className="booking-account-created">
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
      </section>
    );
  }
  if (site.bookingAvailable === false)
    return (
      <section className="booking-unavailable" aria-live="polite">
        <strong>Agendamento online indisponível</strong>
        <p>
          {site.unavailableMessage ??
            'Entre em contato com o estabelecimento para mais informações.'}
        </p>
      </section>
    );

  const logo = site.assets.find((asset) => asset.kind === 'LOGO_COMPACT' || asset.kind === 'LOGO');
  return (
    <div className="public-booking-flow">
      <header className="booking-shell-header">
        {logo === undefined ? (
          <span className="booking-logo-fallback">{initialsOf(site.displayName)}</span>
        ) : (
          <img src={`${environment.apiUrl}${logo.url}`} alt={logo.altText ?? site.displayName} />
        )}
        <div>
          <strong>{site.displayName}</strong>
          <span>Agendar horário</span>
        </div>
      </header>
      <BookingProgress step={step} flow={flow} />
      <div className="booking-layout">
        <main className="booking-main">
          {step !== 'service' ? (
            <button type="button" className="booking-back" onClick={goBack}>
              ← Voltar
            </button>
          ) : null}
          {step === 'service' ? (
            <>
              <ServiceStep
                site={site}
                selected={servicePublicId}
                onSelect={selectService}
              />
              {site.units.length > 1 ? (
                <fieldset className="booking-unit-picker">
                  <legend>Escolha a unidade</legend>
                  {site.units.map((unit) => (
                    <button
                      key={unit.publicId}
                      type="button"
                      aria-pressed={unitPublicId === unit.publicId}
                      onClick={() => {
                        setUnitPublicId(unit.publicId);
                      }}
                    >
                      <strong>{unit.name}</strong>
                      <span>
                        {[unit.street, unit.number, unit.city].filter(Boolean).join(', ')}
                      </span>
                    </button>
                  ))}
                </fieldset>
              ) : null}
            </>
          ) : null}
          {step === 'professional' ? (
            <ProfessionalStep
              site={site}
              professionals={professionals.data?.professionals ?? []}
              selected={professionalPublicId}
              loading={professionals.isPending}
              error={professionals.isError}
              onSelect={selectProfessional}
            />
          ) : null}
          {step === 'date' ? (
            <DateStep
              date={date}
              onSelect={selectDate}
            />
          ) : null}
          {step === 'time' ? (
            <TimeStep
              slots={availableSlots}
              selected={selectedSlot}
              loading={availability.isPending}
              error={availability.isError}
              onSelect={setSelectedSlot}
            />
          ) : null}
          {step === 'customer' ? (
            <CustomerStep
              name={customerName}
              phone={customerPhone}
              email={customerEmail}
              notes={notes}
              createAccount={createAccount}
              accountPassword={accountPassword}
              canCreateAccount={canCreateAccount}
              onChange={changeCustomer}
              onToggleAccount={setCreateAccount}
              onPasswordChange={setAccountPassword}
            />
          ) : null}
          {step === 'payment' ? (
            <PaymentChoiceStep choice={paymentChoice} onSelect={setPaymentChoice} />
          ) : null}
          {step === 'review' ? (
            <section className="booking-step booking-review">
              <StepHeader
                title="Revise seu agendamento"
                subtitle="Confira os dados antes de confirmar."
              />
              <BookingSummary
                site={site}
                serviceId={servicePublicId}
                professional={selectedProfessional}
                unitPublicId={unitPublicId}
                date={date}
                slot={selectedSlot}
                compact
              />
              <div className="booking-review-contact">
                <span>Agendamento para</span>
                <strong>{customerName}</strong>
                <small>{customerPhone || customerEmail}</small>
                {needsPaymentChoice && paymentChoice !== null ? (
                  <small>
                    {paymentChoice === 'online'
                      ? 'Pagamento: online, logo após confirmar.'
                      : 'Pagamento: no atendimento.'}
                  </small>
                ) : null}
              </div>
            </section>
          ) : null}
          {validation !== null ? (
            <p className="booking-inline-error" role="alert">
              {validation}
            </p>
          ) : null}
          {booking.isError ? (
            <div className="booking-inline-error booking-conflict" role="alert">
              <strong>{humanError(booking.error)}</strong>
              {booking.error instanceof HttpError && booking.error.status === 409 ? (
                <button
                  type="button"
                  onClick={() => {
                    setStep('time');
                  }}
                >
                  Escolher outro horário
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="booking-mobile-summary">
            <BookingSummary
              site={site}
              serviceId={servicePublicId}
              professional={selectedProfessional}
              unitPublicId={unitPublicId}
              date={date}
              slot={selectedSlot}
              compact
            />
          </div>
          <div className="booking-mobile-cta">
            <button
              type="button"
              disabled={booking.isPending || (step === 'time' && availability.isPending)}
              onClick={continueFlow}
            >
              {booking.isPending
                ? 'Confirmando…'
                : step === 'review'
                  ? 'Confirmar agendamento'
                  : 'Continuar'}
            </button>
          </div>
        </main>
        <div className="booking-desktop-summary">
          <BookingSummary
            site={site}
            serviceId={servicePublicId}
            professional={selectedProfessional}
            unitPublicId={unitPublicId}
            date={date}
            slot={selectedSlot}
          />
          <button
            type="button"
            disabled={booking.isPending || (step === 'time' && availability.isPending)}
            onClick={continueFlow}
          >
            {booking.isPending
              ? 'Confirmando…'
              : step === 'review'
                ? 'Confirmar agendamento'
                : 'Continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}
