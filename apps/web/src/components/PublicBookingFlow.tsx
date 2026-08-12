import {
  AppointmentPaymentOptionsResponseSchema,
  AvailabilityResponseSchema,
  PaymentGatewayChargePublicSchema,
  PixChargeResponseSchema,
  PublicBookingConfirmationSchema,
  PublicServiceProfessionalsResponseSchema,
  type PublicTenantSiteResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { type z } from 'zod';

import { environment } from '../config/environment.js';
import { httpClient, HttpError } from '../lib/http.js';

type Site = z.infer<typeof PublicTenantSiteResponseSchema>;
type Step = 'service' | 'professional' | 'date' | 'time' | 'customer' | 'review';
type Professional = z.infer<
  typeof PublicServiceProfessionalsResponseSchema
>['professionals'][number];

const steps: { id: Step; label: string }[] = [
  { id: 'service', label: 'Serviço' },
  { id: 'professional', label: 'Profissional' },
  { id: 'date', label: 'Data' },
  { id: 'time', label: 'Horário' },
  { id: 'customer', label: 'Seus dados' },
  { id: 'review', label: 'Revisão' },
];

function centsToBrl(cents: string): string {
  return (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function todayIsoDate(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function dateFromIso(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function isoFromDate(value: Date): string {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function humanError(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 409)
      return 'Esse horário acabou de ser reservado. Escolha outro horário para continuar.';
    if (error.status === 400 || error.status === 422)
      return 'Não foi possível confirmar com esses dados. Revise as informações e tente novamente.';
  }
  return 'Não conseguimos concluir agora. Tente novamente em alguns instantes.';
}

function BookingProgress({ step }: { step: Step }) {
  const activeIndex = steps.findIndex((item) => item.id === step);
  return (
    <nav className="booking-progress" aria-label="Progresso do agendamento">
      <span>{`Etapa ${String(activeIndex + 1)} de ${String(steps.length)}`}</span>
      <div className="booking-progress-track" aria-hidden="true">
        <i style={{ width: `${String(((activeIndex + 1) / steps.length) * 100)}%` }} />
      </div>
      <strong>{steps[activeIndex]?.label}</strong>
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
  onChange,
}: {
  name: string;
  phone: string;
  email: string;
  notes: string;
  onChange: (field: 'name' | 'phone' | 'email' | 'notes', value: string) => void;
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

function AppointmentPaymentStep({
  slug,
  appointmentPublicId,
}: {
  slug: string;
  appointmentPublicId: string;
}) {
  const [pixCharge, setPixCharge] = useState<z.infer<typeof PixChargeResponseSchema> | null>(null);
  const [mpCharge, setMpCharge] = useState<z.infer<typeof PaymentGatewayChargePublicSchema> | null>(
    null,
  );
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
      <section className="booking-payment">
        <h3>Pagamento</h3>
        <strong>{charge == null ? null : centsToBrl(charge.amountCents)}</strong>
        {pixCharge?.qrCodeDataUrl ? (
          <img src={pixCharge.qrCodeDataUrl} alt="QR Code do PIX" />
        ) : null}
        {code ? (
          <>
            <textarea readOnly value={code} rows={3} />
            <button type="button" onClick={() => void navigator.clipboard.writeText(code)}>
              Copiar código PIX
            </button>
          </>
        ) : null}
        <p>O estabelecimento confirmará o recebimento do pagamento.</p>
      </section>
    );
  }
  const data = options.data;
  if (!data.pixLocalAvailable && !data.mercadoPagoAvailable) return null;
  return (
    <section className="booking-payment">
      <h3>Pagamento</h3>
      <p>
        {data.depositRequired
          ? 'Este agendamento exige um sinal.'
          : 'Você pode realizar o pagamento online.'}
      </p>
      <div>
        {data.pixLocalAvailable ? (
          <button
            type="button"
            disabled={createPix.isPending}
            onClick={() => {
              createPix.mutate();
            }}
          >
            Pagar com PIX
          </button>
        ) : null}
        {data.mercadoPagoAvailable ? (
          <button
            type="button"
            disabled={createMercadoPago.isPending}
            onClick={() => {
              createMercadoPago.mutate();
            }}
          >
            Mercado Pago
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function PublicBookingFlow({ slug, site }: { slug: string; site: Site }) {
  const storageKey = `agendei:booking:${slug}`;
  const restored = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem(storageKey) ?? '{}') as Record<string, string>;
    } catch {
      return {};
    }
  }, [storageKey]);
  const serviceFromUrl = new URLSearchParams(window.location.search).get('service');
  const initialService = serviceFromUrl ?? restored.servicePublicId ?? '';
  const restoredStep = steps.some((item) => item.id === restored.step)
    ? restored.step === 'review'
      ? 'customer'
      : (restored.step as Step)
    : null;
  const [step, setStep] = useState<Step>(
    serviceFromUrl !== null
      ? 'professional'
      : (restoredStep ?? (initialService !== '' ? 'professional' : 'service')),
  );
  const [unitPublicId, setUnitPublicId] = useState(
    site.units.length === 1 ? (site.units[0]?.publicId ?? '') : (restored.unitPublicId ?? ''),
  );
  const [servicePublicId, setServicePublicId] = useState(
    site.services.some((item) => item.publicId === initialService) ? initialService : '',
  );
  const [professionalPublicId, setProfessionalPublicId] = useState(
    restored.professionalPublicId ?? '',
  );
  const [date, setDate] = useState(restored.date ?? todayIsoDate());
  const [selectedSlot, setSelectedSlot] = useState<string | null>(restored.selectedSlot ?? null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [validation, setValidation] = useState<string | null>(null);

  useEffect(() => {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        step,
        unitPublicId,
        servicePublicId,
        professionalPublicId,
        date,
        selectedSlot,
      }),
    );
  }, [date, professionalPublicId, selectedSlot, servicePublicId, step, storageKey, unitPublicId]);

  const professionals = useQuery({
    queryKey: ['public-booking', slug, 'professionals', servicePublicId],
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/services/${servicePublicId}/professionals`, {
        schema: PublicServiceProfessionalsResponseSchema,
      }),
    enabled: servicePublicId !== '',
    retry: false,
  });
  const availability = useQuery({
    queryKey: [
      'public-booking',
      slug,
      'availability',
      servicePublicId,
      professionalPublicId,
      date,
      unitPublicId,
    ],
    queryFn: () => {
      const query = new URLSearchParams({ date, professionalPublicId, servicePublicId });
      if (unitPublicId !== '') query.set('unitPublicId', unitPublicId);
      return httpClient.request(`/public/sites/${slug}/availability?${query.toString()}`, {
        schema: AvailabilityResponseSchema,
      });
    },
    enabled:
      step === 'time' &&
      servicePublicId !== '' &&
      professionalPublicId !== '' &&
      date !== '' &&
      (site.units.length <= 1 || unitPublicId !== ''),
    retry: false,
  });
  const selectedProfessional = professionals.data?.professionals.find(
    (item) => item.publicId === professionalPublicId,
  );
  const availableSlots =
    availability.data?.slots.filter((slot) => slot.state === 'AVAILABLE') ?? [];

  const booking = useMutation({
    mutationFn: () =>
      httpClient.request(`/public/sites/${slug}/bookings`, {
        method: 'POST',
        body: {
          unitPublicId: unitPublicId === '' ? null : unitPublicId,
          servicePublicId,
          professionalPublicId,
          startsAt: selectedSlot,
          notes: notes.trim() === '' ? null : notes.trim(),
          customer: {
            name: customerName.trim(),
            phone: customerPhone.trim() === '' ? null : customerPhone.trim(),
            email: customerEmail.trim() === '' ? null : customerEmail.trim(),
          },
        },
        schema: PublicBookingConfirmationSchema,
      }),
    onSuccess: () => {
      sessionStorage.removeItem(storageKey);
    },
    onError: (error) => {
      if (error instanceof HttpError && error.status === 409) {
        setSelectedSlot(null);
        setStep('time');
        void availability.refetch();
      }
    },
  });

  const goBack = () => {
    const index = steps.findIndex((item) => item.id === step);
    if (index > 0) setStep(steps[index - 1]?.id ?? 'service');
    setValidation(null);
  };
  const continueFlow = () => {
    setValidation(null);
    if (step === 'service') {
      if (site.units.length > 1 && unitPublicId === '') {
        setValidation('Escolha a unidade.');
        return;
      }
      if (servicePublicId === '') {
        setValidation('Escolha um serviço.');
        return;
      }
      setStep('professional');
    } else if (step === 'professional') {
      if (professionalPublicId === '') {
        setValidation('Escolha um profissional.');
        return;
      }
      setStep('date');
    } else if (step === 'date') setStep('time');
    else if (step === 'time') {
      if (selectedSlot === null) {
        setValidation('Escolha um horário.');
        return;
      }
      setStep('customer');
    } else if (step === 'customer') {
      if (customerName.trim().length < 2) {
        setValidation('Informe seu nome.');
        return;
      }
      if (customerPhone.trim() === '' && customerEmail.trim() === '') {
        setValidation('Informe telefone ou e-mail para contato.');
        return;
      }
      if (
        customerEmail.trim() !== '' &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(customerEmail.trim())
      ) {
        setValidation('Informe um e-mail válido.');
        return;
      }
      setStep('review');
    } else booking.mutate();
  };

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
        <AppointmentPaymentStep
          slug={slug}
          appointmentPublicId={confirmation.appointmentPublicId}
        />
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
      <BookingProgress step={step} />
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
                onSelect={(id) => {
                  setServicePublicId(id);
                  setProfessionalPublicId('');
                  setSelectedSlot(null);
                }}
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
              onSelect={(id) => {
                setProfessionalPublicId(id);
                setSelectedSlot(null);
              }}
            />
          ) : null}
          {step === 'date' ? (
            <DateStep
              date={date}
              onSelect={(value) => {
                setDate(value);
                setSelectedSlot(null);
              }}
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
              onChange={(field, value) => {
                if (field === 'name') setCustomerName(value);
                else if (field === 'phone') setCustomerPhone(value);
                else if (field === 'email') setCustomerEmail(value);
                else setNotes(value);
              }}
            />
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
