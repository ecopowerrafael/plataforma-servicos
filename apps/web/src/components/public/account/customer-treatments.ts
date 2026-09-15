import {
  AppointmentPublicSchema,
  ApproveTreatmentPlanRequestSchema,
  AvailabilityResponseSchema,
  CreateTreatmentSessionRequestSchema,
  TreatmentPlanListResponseSchema,
  TreatmentPlanPublicSchema,
  treatmentPlanStateLabel,
  type TreatmentPlanPublic,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { httpClient } from '../../../lib/http.js';

export const money = (cents: string) =>
  (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
export const dayTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export const planPath = (slug: string, publicId: string) =>
  `/public/${slug}/conta/tratamentos/${publicId}`;

/** Sessão viva (agendada ou em andamento) ainda por acontecer. */
export function upcomingSession(plan: TreatmentPlanPublic) {
  return plan.sessions.find(
    (session) => session.status === 'PENDING' || session.status === 'CONFIRMED' || session.status === 'IN_PROGRESS',
  );
}

/** Ação principal do card, derivada do estado — nunca um botão sem sentido. */
export function primaryAction(
  plan: TreatmentPlanPublic,
): { kind: 'approve' | 'first-session' | 'next-session' | 'view-session' | 'history' | 'details'; label: string } {
  if (plan.status === 'PENDING') return { kind: 'approve', label: 'Aprovar orçamento' };
  if (plan.status === 'CANCELED') return { kind: 'details', label: 'Ver detalhes' };
  if (plan.status === 'COMPLETED') return { kind: 'history', label: 'Ver histórico' };
  const upcoming = upcomingSession(plan);
  if (upcoming !== undefined) return { kind: 'view-session', label: 'Ver próxima sessão' };
  if (plan.sessionsCompleted === 0) return { kind: 'first-session', label: 'Agendar primeira sessão' };
  return { kind: 'next-session', label: 'Agendar próxima sessão' };
}

export const stateLabel = treatmentPlanStateLabel;

export function useCustomerTreatments(slug: string) {
  return useQuery({
    queryKey: ['public', slug, 'customer', 'treatment-plans'],
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/treatment-plans`, {
        schema: TreatmentPlanListResponseSchema,
      }),
    retry: false,
  });
}

export function useCustomerTreatment(slug: string, publicId: string) {
  const client = useQueryClient();
  const queryKey = ['public', slug, 'customer', 'treatment-plan', publicId];
  const plan = useQuery({
    queryKey,
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/treatment-plans/${publicId}`, {
        schema: TreatmentPlanPublicSchema,
      }),
    retry: false,
  });
  const invalidate = async () => {
    await client.invalidateQueries({ queryKey });
    await client.invalidateQueries({
      queryKey: ['public', slug, 'customer', 'treatment-plans'],
    });
  };
  const approve = useMutation({
    mutationFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/treatment-plans/${publicId}/approve`, {
        method: 'POST',
        body: ApproveTreatmentPlanRequestSchema.parse({}),
        schema: TreatmentPlanPublicSchema,
      }),
    onSuccess: invalidate,
  });
  const schedule = useMutation({
    mutationFn: (startsAt: string) =>
      httpClient.request(`/public/sites/${slug}/customer/treatment-plans/${publicId}/sessions`, {
        method: 'POST',
        body: CreateTreatmentSessionRequestSchema.parse({ startsAt }),
        schema: AppointmentPublicSchema,
      }),
    onSuccess: invalidate,
  });
  return { plan, approve, schedule };
}

/**
 * Horários do profissional do plano em um dia. Mesma fonte de verdade do
 * agendamento público: nenhuma agenda paralela.
 */
export function useTreatmentSlots(
  slug: string,
  plan: TreatmentPlanPublic | undefined,
  date: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['public', slug, 'availability', plan?.publicId ?? '', date],
    enabled: enabled && plan !== undefined,
    queryFn: () =>
      httpClient.request(
        `/public/sites/${slug}/availability?date=${date}&servicePublicId=${plan?.servicePublicId ?? ''}&professionalPublicId=${plan?.professionalPublicId ?? ''}`,
        { schema: AvailabilityResponseSchema },
      ),
    retry: false,
  });
}
