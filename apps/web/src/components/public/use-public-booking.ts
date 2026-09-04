import {
  AvailabilityResponseSchema,
  CustomerAuthResponseSchema,
  CustomerProfileResponseSchema,
  CustomerPasswordSchema,
  CustomerRegisterRequestSchema,
  PublicBookingConfirmationSchema,
  PublicPaymentOptionsResponseSchema,
  PublicProfessionalServicesResponseSchema,
  PublicServiceProfessionalsResponseSchema,
  type PublicTenantSiteResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type z } from 'zod';

import { httpClient, HttpError } from '../../lib/http.js';

export type Site = z.infer<typeof PublicTenantSiteResponseSchema>;
export type BookingStep =
  'service' | 'professional' | 'date' | 'time' | 'customer' | 'payment' | 'review';
export type BookingProfessional = z.infer<
  typeof PublicServiceProfessionalsResponseSchema
>['professionals'][number];
export type PublicBookingEntry =
  | { type: 'SERVICE'; publicId: string }
  | { type: 'COMBO'; publicId: string }
  | { type: 'PROFESSIONAL'; publicId: string }
  | null;

export const BOOKING_STEPS: { id: BookingStep; label: string }[] = [
  { id: 'service', label: 'Serviço' },
  { id: 'professional', label: 'Profissional' },
  { id: 'date', label: 'Data' },
  { id: 'time', label: 'Horário' },
  { id: 'customer', label: 'Seus dados' },
  { id: 'payment', label: 'Pagamento' },
  { id: 'review', label: 'Revisão' },
];

export function todayIsoDate(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function isoFromDate(value: Date): string {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function dateFromIso(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

export function centsToBrl(cents: string): string {
  return (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('pt-BR') ?? '')
    .join('');
}

export function humanError(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 409)
      return 'Esse horário acabou de ser reservado. Escolha outro horário para continuar.';
    if (error.status === 400 || error.status === 422)
      return 'Não foi possível confirmar com esses dados. Revise as informações e tente novamente.';
  }
  return 'Não conseguimos concluir agora. Tente novamente em alguns instantes.';
}

/**
 * Única fonte da lógica do agendamento público: passos, validações, consultas de
 * disponibilidade, criação do agendamento, conta opcional e decisão de pagamento.
 * As apresentações (Clássico e App Premium) só desenham o que este hook expõe.
 */
export function usePublicBooking(slug: string, site: Site, initialEntry?: PublicBookingEntry) {
  const bookingSubmissionInFlight = useRef(false);
  const entryConsumedRef = useRef(false);
  const storageKey = `agendei:booking:${slug}`;
  const restored = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem(storageKey) ?? '{}') as Record<string, string>;
    } catch {
      return {};
    }
  }, [storageKey]);

  // Priority: initialEntry > query param > sessionStorage > default
  const serviceFromUrl = new URLSearchParams(window.location.search).get('service');
  const comboFromUrl = new URLSearchParams(window.location.search).get('combo');
  const professionalFromUrl = new URLSearchParams(window.location.search).get('professional');

  const initialService = initialEntry?.type === 'SERVICE'
    ? initialEntry.publicId
    : serviceFromUrl ?? restored.servicePublicId ?? '';
  const initialCombo = initialEntry?.type === 'COMBO'
    ? initialEntry.publicId
    : comboFromUrl ?? restored.comboPublicId ?? '';
  const initialProfessional = initialEntry?.type === 'PROFESSIONAL'
    ? initialEntry.publicId
    : professionalFromUrl ?? restored.professionalPublicId ?? '';

  const restoredStep = BOOKING_STEPS.some((item) => item.id === restored.step)
    ? restored.step === 'review'
      ? 'customer'
      : (restored.step as BookingStep)
    : null;

  // Determine initial step based on entry type
  let initialStep: BookingStep;
  if (initialEntry?.type === 'SERVICE' || initialEntry?.type === 'COMBO') {
    initialStep = 'professional';
  } else if (initialEntry?.type === 'PROFESSIONAL') {
    initialStep = 'service';
  } else if (serviceFromUrl !== null) {
    initialStep = 'professional';
  } else if (professionalFromUrl !== null) {
    initialStep = 'service';
  } else {
    initialStep = restoredStep ?? (initialService !== '' ? 'professional' : 'service');
  }

  const [step, setStep] = useState<BookingStep>(initialStep);
  const [unitPublicId, setUnitPublicId] = useState(
    site.units.length === 1 ? (site.units[0]?.publicId ?? '') : (restored.unitPublicId ?? ''),
  );
  const [servicePublicId, setServicePublicId] = useState(
    site.services.some((item) => item.publicId === initialService) ? initialService : '',
  );
  const [comboPublicId, setComboPublicId] = useState(
    site.combos.some((item) => item.publicId === initialCombo) ? initialCombo : '',
  );
  const [professionalPublicId, setProfessionalPublicId] = useState(
    site.professionals.some((item) => item.publicId === initialProfessional)
      ? initialProfessional
      : '',
  );
  const [date, setDate] = useState(restored.date ?? todayIsoDate());
  const [selectedSlot, setSelectedSlot] = useState<string | null>(restored.selectedSlot ?? null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const [createAccount, setCreateAccount] = useState(false);
  const [accountPassword, setAccountPassword] = useState('');
  const [accountError, setAccountError] = useState<string | null>(null);
  const [paymentChoice, setPaymentChoice] = useState<'online' | 'local' | null>(null);

  const customerSession = useQuery({
    queryKey: ['public', slug, 'customer', 'me'],
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/me`, {
        schema: CustomerAuthResponseSchema,
      }),
    retry: false,
  });
  const authenticated = customerSession.data !== undefined;
  // Cliente autenticado não redigita o que já está no perfil.
  const customerProfile = useQuery({
    queryKey: ['public', slug, 'customer', 'profile'],
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/profile`, {
        schema: CustomerProfileResponseSchema,
      }),
    enabled: authenticated,
    retry: false,
  });
  const profile = customerProfile.data?.profile;
  // Valores derivados: o que o cliente digitar prevalece, senão vale o perfil.
  const effectiveName = customerName === '' ? (profile?.name ?? '') : customerName;
  const effectivePhone =
    customerPhone === '' ? (profile?.whatsapp ?? profile?.phone ?? '') : customerPhone;
  const effectiveEmail = customerEmail === '' ? (profile?.email ?? '') : customerEmail;
  // O passo "Seus dados" some quando o perfil já traz nome e um contato válido.
  const profileComplete =
    profile !== undefined &&
    profile.name.trim().length >= 2 &&
    ((profile.whatsapp ?? profile.phone ?? '').trim() !== '' ||
      (profile.email ?? '').trim() !== '');
  const tenantOptions = useQuery({
    queryKey: ['public-booking', slug, 'payment-options'],
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/payment-options`, {
        schema: PublicPaymentOptionsResponseSchema,
      }),
    retry: false,
  });
  const onlineAvailable =
    (tenantOptions.data?.pixLocalAvailable ?? false) ||
    (tenantOptions.data?.mercadoPagoAvailable ?? false);
  const localAvailable = tenantOptions.data?.payLocalAvailable ?? true;
  // Só existe etapa de pagamento quando há de fato uma escolha a fazer.
  const needsPaymentChoice = onlineAvailable && localAvailable;
  // When a professional is pre-selected, skip professional step
  const isProfessionalPreselected = initialEntry?.type === 'PROFESSIONAL' && professionalPublicId !== '';
  const flow = BOOKING_STEPS.map((item) => item.id).filter(
    (id) =>
      (id !== 'payment' || needsPaymentChoice) &&
      (id !== 'customer' || !profileComplete) &&
      (id !== 'professional' || !isProfessionalPreselected),
  );
  const payOnline = needsPaymentChoice ? paymentChoice === 'online' : onlineAvailable;
  // Se o perfil já cobre os dados, o passo "Seus dados" nunca é apresentado:
  // o passo efetivo é derivado, sem setState dentro de efeito.
  const effectiveStep: BookingStep =
    profileComplete && step === 'customer' ? (needsPaymentChoice ? 'payment' : 'review') : step;

  const registerAccount = useMutation({
    mutationFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/register`, {
        method: 'POST',
        body: CustomerRegisterRequestSchema.parse({
          name: effectiveName.trim(),
          email: effectiveEmail.trim(),
          phone: effectivePhone.trim() === '' ? null : effectivePhone.trim(),
          password: accountPassword,
        }),
        schema: CustomerAuthResponseSchema,
      }),
  });

  useEffect(() => {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        step,
        unitPublicId,
        servicePublicId,
        comboPublicId,
        professionalPublicId,
        date,
        selectedSlot,
      }),
    );
  }, [date, professionalPublicId, selectedSlot, servicePublicId, comboPublicId, step, storageKey, unitPublicId]);

  const professionals = useQuery({
    queryKey: ['public-booking', slug, 'professionals', servicePublicId, comboPublicId],
    queryFn: async () => {
      if (comboPublicId !== '') {
        return httpClient.request(`/public/sites/${slug}/combos/${comboPublicId}/professionals`, {
          schema: PublicServiceProfessionalsResponseSchema,
        });
      }
      return httpClient.request(`/public/sites/${slug}/services/${servicePublicId}/professionals`, {
        schema: PublicServiceProfessionalsResponseSchema,
      });
    },
    enabled: servicePublicId !== '' || comboPublicId !== '',
    retry: false,
  });

  const professionalServices = useQuery({
    queryKey: ['public-booking', slug, 'services', professionalPublicId],
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/professionals/${professionalPublicId}/services`, {
        schema: PublicProfessionalServicesResponseSchema,
      }),
    enabled: professionalPublicId !== '',
    retry: false,
  });
  const availability = useQuery({
    queryKey: [
      'public-booking',
      slug,
      'availability',
      servicePublicId,
      comboPublicId,
      professionalPublicId,
      date,
      unitPublicId,
    ],
    queryFn: () => {
      const query = new URLSearchParams({ date, professionalPublicId });
      if (servicePublicId !== '') query.set('servicePublicId', servicePublicId);
      if (comboPublicId !== '') query.set('comboPublicId', comboPublicId);
      if (unitPublicId !== '') query.set('unitPublicId', unitPublicId);
      return httpClient.request(`/public/sites/${slug}/availability?${query.toString()}`, {
        schema: AvailabilityResponseSchema,
      });
    },
    enabled:
      step === 'time' &&
      (servicePublicId !== '' || comboPublicId !== '') &&
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
          servicePublicId: servicePublicId === '' ? null : servicePublicId,
          comboPublicId: comboPublicId === '' ? null : comboPublicId,
          professionalPublicId,
          startsAt: selectedSlot,
          notes: notes.trim() === '' ? null : notes.trim(),
          customer: {
            name: effectiveName.trim(),
            phone: effectivePhone.trim() === '' ? null : effectivePhone.trim(),
            email: effectiveEmail.trim() === '' ? null : effectiveEmail.trim(),
          },
        },
        schema: PublicBookingConfirmationSchema,
      }),
    onSuccess: async () => {
      sessionStorage.removeItem(storageKey);
      // A conta é criada depois do agendamento, com os dados já informados.
      if (createAccount && accountPassword !== '') {
        try {
          await registerAccount.mutateAsync();
        } catch (error) {
          setAccountError(
            error instanceof HttpError
              ? error.message
              : 'O agendamento foi confirmado, mas não conseguimos criar sua conta agora.',
          );
        }
      }
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
    const index = flow.indexOf(effectiveStep);
    if (index > 0) setStep(flow[index - 1] ?? 'service');
    setValidation(null);
  };
  const continueFlow = () => {
    setValidation(null);
    const step = effectiveStep;
    if (step === 'service') {
      if (site.units.length > 1 && unitPublicId === '') {
        setValidation('Escolha a unidade.');
        return;
      }
      if (servicePublicId === '' && comboPublicId === '') {
        setValidation('Escolha um serviço ou pacote.');
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
      setStep(profileComplete ? (needsPaymentChoice ? 'payment' : 'review') : 'customer');
    } else if (step === 'customer') {
      if (effectiveName.trim().length < 2) {
        setValidation('Informe seu nome.');
        return;
      }
      if (effectivePhone.trim() === '' && effectiveEmail.trim() === '') {
        setValidation('Informe telefone ou e-mail para contato.');
        return;
      }
      if (
        effectiveEmail.trim() !== '' &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(effectiveEmail.trim())
      ) {
        setValidation('Informe um e-mail válido.');
        return;
      }
      if (createAccount) {
        if (effectiveEmail.trim() === '') {
          setValidation('Informe um e-mail para criar sua conta.');
          return;
        }
        const passwordCheck = CustomerPasswordSchema.safeParse(accountPassword);
        if (!passwordCheck.success) {
          setValidation(
            passwordCheck.error.issues[0]?.message ?? 'Escolha uma senha válida para sua conta.',
          );
          return;
        }
      }
      setStep(needsPaymentChoice ? 'payment' : 'review');
    } else if (step === 'payment') {
      if (paymentChoice === null) {
        setValidation('Escolha como prefere pagar.');
        return;
      }
      setStep('review');
    } else if (!bookingSubmissionInFlight.current) {
      bookingSubmissionInFlight.current = true;
      booking.mutate(undefined, {
        onSettled: () => {
          bookingSubmissionInFlight.current = false;
        },
      });
    }
  };

  const selectService = (id: string) => {
    setServicePublicId(id);
    setComboPublicId('');
    // Only clear professional if not pre-selected
    if (!isProfessionalPreselected) {
      setProfessionalPublicId('');
    }
    setSelectedSlot(null);
  };
  const selectServiceAndContinue = (id: string) => {
    selectService(id);
    setValidation(null);
    // If professional is pre-selected, skip to date; otherwise go to professional
    setStep(isProfessionalPreselected ? 'date' : 'professional');
  };
  const selectCombo = (id: string) => {
    setComboPublicId(id);
    setServicePublicId('');
    // Only clear professional if not pre-selected
    if (!isProfessionalPreselected) {
      setProfessionalPublicId('');
    }
    setSelectedSlot(null);
  };
  const selectComboAndContinue = (id: string) => {
    selectCombo(id);
    setValidation(null);
    // If professional is pre-selected, skip to date; otherwise go to professional
    setStep(isProfessionalPreselected ? 'date' : 'professional');
  };
  const selectProfessional = (id: string) => {
    setProfessionalPublicId(id);
    setSelectedSlot(null);
  };
  const selectProfessionalAndContinue = (id: string) => {
    selectProfessional(id);
    setValidation(null);
    setStep('date');
  };
  const selectDate = (value: string) => {
    setDate(value);
    setSelectedSlot(null);
  };
  const selectDateAndContinue = (value: string) => {
    selectDate(value);
    setValidation(null);
    setStep('time');
  };
  const selectSlotAndContinue = (value: string) => {
    setSelectedSlot(value);
    setValidation(null);
    setStep(profileComplete ? (needsPaymentChoice ? 'payment' : 'review') : 'customer');
  };
  const changeCustomer = (field: 'name' | 'phone' | 'email' | 'notes', value: string) => {
    if (field === 'name') setCustomerName(value);
    else if (field === 'phone') setCustomerPhone(value);
    else if (field === 'email') setCustomerEmail(value);
    else setNotes(value);
  };

  return {
    step: effectiveStep,
    setStep,
    flow,
    goBack,
    continueFlow,
    validation,
    unitPublicId,
    setUnitPublicId,
    servicePublicId,
    selectService,
    selectServiceAndContinue,
    comboPublicId,
    setComboPublicId,
    selectCombo,
    selectComboAndContinue,
    professionalPublicId,
    selectProfessional,
    selectProfessionalAndContinue,
    professionals,
    professionalServices,
    selectedProfessional,
    date,
    selectDate,
    selectDateAndContinue,
    selectedSlot,
    setSelectedSlot,
    selectSlotAndContinue,
    availability,
    availableSlots,
    customerName: effectiveName,
    customerPhone: effectivePhone,
    customerEmail: effectiveEmail,
    notes,
    changeCustomer,
    createAccount,
    setCreateAccount,
    accountPassword,
    setAccountPassword,
    accountError,
    accountCreated: registerAccount.isSuccess,
    canCreateAccount: !authenticated,
    authenticated,
    profileComplete,
    paymentChoice,
    setPaymentChoice,
    needsPaymentChoice,
    onlineAvailable,
    payOnline,
    booking,
  };
}
