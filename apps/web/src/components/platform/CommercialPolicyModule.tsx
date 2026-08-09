import {
  PlatformTenantListResponseSchema,
  TenantCommercialPolicySchema,
  UpdateTenantCommercialPolicyRequestSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { ConfirmationDialog, type ConfirmationRequest } from '../ConfirmationDialog.js';

const UpdateResponseSchema = z.object({ policy: TenantCommercialPolicySchema });

const publicSiteBehaviorLabels: Record<string, string> = {
  NORMAL: 'Normal',
  HIDE_BOOKING: 'Ocultar agendamento',
  OFFLINE: 'Site indisponível',
};

interface FormState {
  defaultTrialDays: string;
  graceDays: string;
  autoSuspendAfterGrace: boolean;
  allowAdminLoginWhileBlocked: boolean;
  allowCalendarReadWhileBlocked: boolean;
  allowAdminChangesWhileBlocked: boolean;
  allowInternalBookingWhileBlocked: boolean;
  allowPublicBookingWhileBlocked: boolean;
  publicSiteBehaviorWhileBlocked: 'NORMAL' | 'HIDE_BOOKING' | 'OFFLINE';
  adminMessage: string;
  publicMessage: string;
}

function toFormState(policy: z.infer<typeof TenantCommercialPolicySchema>): FormState {
  return {
    defaultTrialDays: String(policy.defaultTrialDays),
    graceDays: String(policy.graceDays),
    autoSuspendAfterGrace: policy.autoSuspendAfterGrace,
    allowAdminLoginWhileBlocked: policy.allowAdminLoginWhileBlocked,
    allowCalendarReadWhileBlocked: policy.allowCalendarReadWhileBlocked,
    allowAdminChangesWhileBlocked: policy.allowAdminChangesWhileBlocked,
    allowInternalBookingWhileBlocked: policy.allowInternalBookingWhileBlocked,
    allowPublicBookingWhileBlocked: policy.allowPublicBookingWhileBlocked,
    publicSiteBehaviorWhileBlocked: policy.publicSiteBehaviorWhileBlocked,
    adminMessage: policy.adminMessage,
    publicMessage: policy.publicMessage,
  };
}

export function CommercialPolicyModule() {
  const client = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tenantFilter, setTenantFilter] = useState<'trial' | 'past_due' | 'suspended'>('trial');
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);

  const policy = useQuery({
    queryKey: ['platform', 'commercial-policy'],
    queryFn: () =>
      httpClient.request('/platform/commercial-policy', { schema: TenantCommercialPolicySchema }),
    retry: false,
  });

  if (policy.data !== undefined && form === null) {
    setForm(toFormState(policy.data));
  }

  const updateMutation = useMutation({
    mutationFn: (body: z.infer<typeof UpdateTenantCommercialPolicyRequestSchema>) =>
      httpClient.request('/platform/commercial-policy', {
        method: 'PATCH',
        body,
        schema: UpdateResponseSchema,
      }),
    onSuccess: async (result) => {
      setNotice('Política comercial atualizada com sucesso.');
      setForm(toFormState(result.policy));
      await client.invalidateQueries({ queryKey: ['platform', 'commercial-policy'] });
    },
  });

  const submit = () => {
    if (form === null) return;
    const parsed = UpdateTenantCommercialPolicyRequestSchema.safeParse({
      defaultTrialDays: Number(form.defaultTrialDays),
      graceDays: Number(form.graceDays),
      autoSuspendAfterGrace: form.autoSuspendAfterGrace,
      allowAdminLoginWhileBlocked: form.allowAdminLoginWhileBlocked,
      allowCalendarReadWhileBlocked: form.allowCalendarReadWhileBlocked,
      allowAdminChangesWhileBlocked: form.allowAdminChangesWhileBlocked,
      allowInternalBookingWhileBlocked: form.allowInternalBookingWhileBlocked,
      allowPublicBookingWhileBlocked: form.allowPublicBookingWhileBlocked,
      publicSiteBehaviorWhileBlocked: form.publicSiteBehaviorWhileBlocked,
      adminMessage: form.adminMessage,
      publicMessage: form.publicMessage,
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Revise os campos informados.');
      return;
    }
    setFormError(null);
    void updateMutation.mutateAsync(parsed.data);
  };

  const tenantsQuery = useQuery({
    queryKey: ['platform', 'tenants', 'commercial', tenantFilter],
    queryFn: () => {
      const query = new URLSearchParams({ page: '1', limit: '50', orderBy: 'createdAt', direction: 'desc' });
      if (tenantFilter === 'trial') query.set('trialActive', 'true');
      if (tenantFilter === 'past_due') query.set('subscriptionStatus', 'PAST_DUE');
      if (tenantFilter === 'suspended') query.set('subscriptionStatus', 'SUSPENDED');
      return httpClient.request(`/platform/tenants?${query.toString()}`, {
        schema: PlatformTenantListResponseSchema,
      });
    },
    retry: false,
  });

  const reactivateMutation = useMutation({
    mutationFn: (subscriptionPublicId: string) =>
      httpClient.request(`/platform/subscriptions/${subscriptionPublicId}/reactivate`, {
        method: 'POST',
        body: { reason: 'Reativação manual via política comercial' },
        schema: z.looseObject({}),
      }),
    onSuccess: async () => {
      setNotice('Assinatura reativada com sucesso.');
      await client.invalidateQueries({ queryKey: ['platform', 'tenants', 'commercial'] });
    },
  });

  const requestReactivation = (subscriptionPublicId: string, tenantName: string) => {
    setConfirmation({
      title: 'Reativar assinatura?',
      description: `A assinatura de ${tenantName} será reativada imediatamente.`,
      confirmLabel: 'Reativar',
      requiresReason: false,
      onConfirm: async () => {
        await reactivateMutation.mutateAsync(subscriptionPublicId);
      },
    });
  };

  return (
    <section aria-labelledby="commercial-policy-title">
      <p className="eyebrow">{'Gestão comercial'}</p>
      <h2 id="commercial-policy-title">{'Política Comercial'}</h2>
      {notice !== null && <p className="success-message">{notice}</p>}
      {policy.isPending ? (
        <p>{'Carregando política comercial…'}</p>
      ) : policy.error instanceof Error ? (
        <p className="form-error">{'Não foi possível carregar a política comercial.'}</p>
      ) : form !== null ? (
        <form
          className="platform-form"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label>
            Dias de teste padrão
            <input
              type="number"
              min={0}
              value={form.defaultTrialDays}
              onChange={(event) => {
                setForm({ ...form, defaultTrialDays: event.target.value });
              }}
            />
          </label>
          <label>
            Dias de carência
            <input
              type="number"
              min={0}
              value={form.graceDays}
              onChange={(event) => {
                setForm({ ...form, graceDays: event.target.value });
              }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.autoSuspendAfterGrace}
              onChange={(event) => {
                setForm({ ...form, autoSuspendAfterGrace: event.target.checked });
              }}
            />
            {' Suspender automaticamente após a carência'}
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.allowAdminLoginWhileBlocked}
              onChange={(event) => {
                setForm({ ...form, allowAdminLoginWhileBlocked: event.target.checked });
              }}
            />
            {' Permitir login administrativo enquanto bloqueado'}
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.allowCalendarReadWhileBlocked}
              onChange={(event) => {
                setForm({ ...form, allowCalendarReadWhileBlocked: event.target.checked });
              }}
            />
            {' Permitir leitura da agenda enquanto bloqueado'}
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.allowAdminChangesWhileBlocked}
              onChange={(event) => {
                setForm({ ...form, allowAdminChangesWhileBlocked: event.target.checked });
              }}
            />
            {' Permitir alterações administrativas enquanto bloqueado'}
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.allowInternalBookingWhileBlocked}
              onChange={(event) => {
                setForm({ ...form, allowInternalBookingWhileBlocked: event.target.checked });
              }}
            />
            {' Permitir agendamento interno enquanto bloqueado'}
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.allowPublicBookingWhileBlocked}
              onChange={(event) => {
                setForm({ ...form, allowPublicBookingWhileBlocked: event.target.checked });
              }}
            />
            {' Permitir agendamento público enquanto bloqueado'}
          </label>
          <label>
            Comportamento do site público enquanto bloqueado
            <select
              value={form.publicSiteBehaviorWhileBlocked}
              onChange={(event) => {
                setForm({
                  ...form,
                  publicSiteBehaviorWhileBlocked: event.target.value as FormState['publicSiteBehaviorWhileBlocked'],
                });
              }}
            >
              {Object.entries(publicSiteBehaviorLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Mensagem administrativa
            <textarea
              value={form.adminMessage}
              onChange={(event) => {
                setForm({ ...form, adminMessage: event.target.value });
              }}
            />
          </label>
          <label>
            Mensagem pública
            <textarea
              value={form.publicMessage}
              onChange={(event) => {
                setForm({ ...form, publicMessage: event.target.value });
              }}
            />
          </label>
          {formError !== null && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <button disabled={updateMutation.isPending} type="submit">
            {updateMutation.isPending ? 'Salvando…' : 'Salvar política'}
          </button>
        </form>
      ) : null}

      <h3>Estabelecimentos por situação comercial</h3>
      <div className="platform-form">
        <label>
          Filtro
          <select
            value={tenantFilter}
            onChange={(event) => {
              setTenantFilter(event.target.value as typeof tenantFilter);
            }}
          >
            <option value="trial">Em teste</option>
            <option value="past_due">Vencidas</option>
            <option value="suspended">Suspensas</option>
          </select>
        </label>
      </div>
      {tenantsQuery.isPending ? (
        <p>{'Carregando estabelecimentos…'}</p>
      ) : tenantsQuery.error instanceof Error ? (
        <p className="form-error">{'Não foi possível carregar os estabelecimentos.'}</p>
      ) : tenantsQuery.data === undefined || tenantsQuery.data.items.length === 0 ? (
        <p>Nenhum estabelecimento encontrado para este filtro.</p>
      ) : (
        <div className="data-list">
          {tenantsQuery.data.items.map((tenant) => (
            <div className="data-row" key={tenant.publicId}>
              <span>{tenant.displayName}</span>
              <span>{tenant.subscription?.status ?? 'Sem assinatura'}</span>
              <span>{tenant.subscription?.trialEndsAt ?? '—'}</span>
              <span>{tenant.subscription?.currentPeriodEndsAt ?? '—'}</span>
              {tenant.subscription !== null && (
                <button
                  disabled={reactivateMutation.isPending}
                  onClick={() => {
                    const subscription = tenant.subscription;
                    if (subscription === null) return;
                    requestReactivation(subscription.publicId, tenant.displayName);
                  }}
                  type="button"
                >
                  Reativar
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {confirmation !== null && (
        <ConfirmationDialog
          request={confirmation}
          onClose={() => {
            setConfirmation(null);
          }}
        />
      )}
    </section>
  );
}
