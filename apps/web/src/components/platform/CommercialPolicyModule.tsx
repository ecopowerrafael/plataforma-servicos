import {
  PlatformTenantListResponseSchema,
  TenantCommercialPolicySchema,
  UpdateTenantCommercialPolicyRequestSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { z } from 'zod';

import { HttpError, httpClient } from '../../lib/http.js';
import { ConfirmationDialog, type ConfirmationRequest } from '../ConfirmationDialog.js';
import { ErrorState, formatDate, PageHeader, StatusBadge } from './PlatformUi.js';
import { Switch } from '../ui/AppUi.js';

const UpdateResponseSchema = z.object({ policy: TenantCommercialPolicySchema });
type Policy = z.infer<typeof TenantCommercialPolicySchema>;
type FormState = Omit<
  Policy,
  'publicId' | 'createdAt' | 'updatedAt' | 'defaultTrialDays' | 'graceDays'
> & { defaultTrialDays: string; graceDays: string };
const toForm = ({
  publicId: _publicId,
  createdAt: _createdAt,
  updatedAt: _updatedAt,
  ...policy
}: Policy): FormState => ({
  ...policy,
  defaultTrialDays: String(policy.defaultTrialDays),
  graceDays: String(policy.graceDays),
});
const policyFieldLabel: Record<string, string> = {
  commercialWhatsapp: 'WhatsApp comercial',
  adminMessage: 'Mensagem administrativa',
  publicMessage: 'Mensagem pública',
  publicSiteBehaviorWhileBlocked: 'Comportamento do site público',
};
const updateErrorMessage = (error: unknown) => {
  if (!(error instanceof HttpError) || error.details === undefined || error.details.length === 0) {
    return error instanceof Error ? error.message : 'Não foi possível salvar a política comercial.';
  }
  const issue = error.details[0]!;
  const field = issue.path.replace(/^\//u, '').split('/')[0] ?? '';
  return `${policyFieldLabel[field] ?? (field || 'Campo')}: ${issue.message}`;
};
const behavior = {
  NORMAL: [
    'Manter site disponível',
    'O site e o agendamento seguem as permissões configuradas abaixo.',
  ],
  HIDE_BOOKING: [
    'Ocultar agendamento',
    'Clientes continuam vendo o estabelecimento, mas não podem agendar.',
  ],
  OFFLINE: ['Site indisponível', 'O site público não fica disponível enquanto houver bloqueio.'],
} as const;

function PolicySwitch({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return <Switch checked={checked} description={description} label={title} onChange={onChange} />;
}

export function CommercialPolicyModule() {
  const client = useQueryClient();
  const [formOverride, setForm] = useState<FormState | null>(null);
  const [savedOverride, setSaved] = useState<FormState | null>(null);
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
  const loaded = policy.data ? toForm(policy.data) : null;
  const form = formOverride ?? loaded;
  const saved = savedOverride ?? loaded;
  const dirty = useMemo(
    () => form !== null && saved !== null && JSON.stringify(form) !== JSON.stringify(saved),
    [form, saved],
  );
  const update = useMutation({
    mutationFn: (body: z.infer<typeof UpdateTenantCommercialPolicyRequestSchema>) =>
      httpClient.request('/platform/commercial-policy', {
        method: 'PATCH',
        body,
        schema: UpdateResponseSchema,
      }),
    onSuccess: async (result) => {
      const next = toForm(result.policy);
      setForm(next);
      setSaved(next);
      setNotice('Política comercial atualizada.');
      await client.invalidateQueries({ queryKey: ['platform', 'commercial-policy'] });
    },
  });
  const change = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    if (form) {
      setNotice(null);
      setForm({ ...form, [key]: value });
    }
  };
  const submit = () => {
    if (!form) return;
    const parsed = UpdateTenantCommercialPolicyRequestSchema.safeParse({
      ...form,
      defaultTrialDays: Number(form.defaultTrialDays),
      graceDays: Number(form.graceDays),
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Revise os campos informados.');
      return;
    }
    setFormError(null);
    void update.mutateAsync(parsed.data);
  };
  const tenants = useQuery({
    queryKey: ['platform', 'tenants', 'commercial', tenantFilter],
    queryFn: () => {
      const q = new URLSearchParams({
        page: '1',
        limit: '50',
        orderBy: 'createdAt',
        direction: 'desc',
      });
      if (tenantFilter === 'trial') q.set('trialActive', 'true');
      else q.set('subscriptionStatus', tenantFilter === 'past_due' ? 'PAST_DUE' : 'SUSPENDED');
      return httpClient.request(`/platform/tenants?${q.toString()}`, {
        schema: PlatformTenantListResponseSchema,
      });
    },
    retry: false,
  });
  const reactivate = useMutation({
    mutationFn: (id: string) =>
      httpClient.request(`/platform/subscriptions/${id}/reactivate`, {
        method: 'POST',
        body: { reason: 'Reativação manual via política comercial' },
        schema: z.looseObject({}),
      }),
    onSuccess: async () => {
      setNotice('Assinatura reativada com sucesso.');
      await client.invalidateQueries({ queryKey: ['platform', 'tenants', 'commercial'] });
    },
  });
  const requestReactivation = (id: string, name: string) => {
    setConfirmation({
      title: 'Reativar assinatura?',
      description: `A assinatura de ${name} será reativada imediatamente.`,
      confirmLabel: 'Reativar',
      requiresReason: false,
      onConfirm: async () => {
        await reactivate.mutateAsync(id);
      },
    });
  };
  return (
    <section>
      <PageHeader
        title="Política comercial"
        description="Defina regras de trial, inadimplência, bloqueio e acesso aos estabelecimentos."
        action={
          <button disabled={!dirty || update.isPending} onClick={submit} type="button">
            {update.isPending ? 'Salvando…' : 'Salvar alterações'}
          </button>
        }
      />
      {dirty ? <p className="platform-unsaved">Alterações não salvas</p> : null}
      {notice ? <p className="success-message">{notice}</p> : null}
      {policy.isPending ? (
        <div className="platform-table-skeleton">
          <i className="platform-skeleton" />
          <i className="platform-skeleton" />
        </div>
      ) : policy.error instanceof Error ? (
        <ErrorState
          message="Não foi possível carregar a política comercial."
          retry={() => {
            void policy.refetch();
          }}
        />
      ) : form ? (
        <div className="platform-policy-grid">
          <section className="platform-panel">
            <h3>Trial e cobrança</h3>
            <div className="platform-number-grid">
              <label>
                <strong>Período de teste padrão</strong>
                <span>
                  <input
                    min={0}
                    type="number"
                    value={form.defaultTrialDays}
                    onChange={(e) => {
                      change('defaultTrialDays', e.target.value);
                    }}
                  />{' '}
                  dias
                </span>
              </label>
              <label>
                <strong>Carência após vencimento</strong>
                <span>
                  <input
                    min={0}
                    type="number"
                    value={form.graceDays}
                    onChange={(e) => {
                      change('graceDays', e.target.value);
                    }}
                  />{' '}
                  dias
                </span>
              </label>
            </div>
            <PolicySwitch
              title="Suspender automaticamente após a carência"
              description="Bloqueia a assinatura quando o período de carência terminar."
              checked={form.autoSuspendAfterGrace}
              onChange={(v) => {
                change('autoSuspendAfterGrace', v);
              }}
            />
          </section>
          <section className="platform-panel">
            <h3>Acesso administrativo durante bloqueio</h3>
            <PolicySwitch
              title="Permitir login administrativo"
              description="A equipe poderá acessar o painel mesmo com a assinatura bloqueada."
              checked={form.allowAdminLoginWhileBlocked}
              onChange={(v) => {
                change('allowAdminLoginWhileBlocked', v);
              }}
            />
            <PolicySwitch
              title="Permitir leitura da agenda"
              description="A equipe poderá consultar horários durante o bloqueio."
              checked={form.allowCalendarReadWhileBlocked}
              onChange={(v) => {
                change('allowCalendarReadWhileBlocked', v);
              }}
            />
            <PolicySwitch
              title="Permitir alterações administrativas"
              description="A equipe poderá editar dados durante o bloqueio."
              checked={form.allowAdminChangesWhileBlocked}
              onChange={(v) => {
                change('allowAdminChangesWhileBlocked', v);
              }}
            />
          </section>
          <section className="platform-panel">
            <h3>Atendimento comercial</h3>
            <label className="platform-field">
              <strong>WhatsApp comercial do Agendei</strong>
              <small>Exibido somente no botão flutuante das páginas comerciais públicas.</small>
              <input
                inputMode="tel"
                placeholder="5511999999999"
                type="tel"
                value={form.commercialWhatsapp ?? ''}
                onChange={(e) => {
                  change('commercialWhatsapp', e.target.value === '' ? null : e.target.value);
                }}
              />
            </label>
          </section>
          <section className="platform-panel">
            <h3>Agendamentos durante bloqueio</h3>
            <PolicySwitch
              title="Permitir agendamento interno"
              description="A equipe poderá criar agendamentos pelo painel."
              checked={form.allowInternalBookingWhileBlocked}
              onChange={(v) => {
                change('allowInternalBookingWhileBlocked', v);
              }}
            />
            <PolicySwitch
              title="Permitir agendamento público"
              description="Clientes poderão criar novos agendamentos no site."
              checked={form.allowPublicBookingWhileBlocked}
              onChange={(v) => {
                change('allowPublicBookingWhileBlocked', v);
              }}
            />
          </section>
          <section className="platform-panel platform-policy-public">
            <h3>Experiência pública</h3>
            <label className="platform-field">
              <strong>Comportamento do site público enquanto bloqueado</strong>
              <select
                value={form.publicSiteBehaviorWhileBlocked}
                onChange={(e) => {
                  change(
                    'publicSiteBehaviorWhileBlocked',
                    e.target.value as FormState['publicSiteBehaviorWhileBlocked'],
                  );
                }}
              >
                {Object.entries(behavior).map(([value, [label]]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <small>{behavior[form.publicSiteBehaviorWhileBlocked][1]}</small>
            </label>
            <label className="platform-field">
              <strong>Mensagem administrativa</strong>
              <small>Orientação exibida para a equipe no painel.</small>
              <textarea
                value={form.adminMessage}
                onChange={(e) => {
                  change('adminMessage', e.target.value);
                }}
              />
            </label>
            <label className="platform-field">
              <strong>Mensagem pública</strong>
              <small>Orientação exibida aos clientes no site.</small>
              <textarea
                value={form.publicMessage}
                onChange={(e) => {
                  change('publicMessage', e.target.value);
                }}
              />
            </label>
          </section>
          {formError ? (
            <p className="form-error" role="alert">
              {formError}
            </p>
          ) : null}
          {update.error instanceof Error ? (
            <p className="form-error" role="alert">
              {updateErrorMessage(update.error)}
            </p>
          ) : null}
        </div>
      ) : null}
      <section className="platform-panel">
        <header>
          <div>
            <h3>Estabelecimentos por situação comercial</h3>
            <p>Acompanhe períodos e intervenha somente quando a regra atual permitir.</p>
          </div>
          <label>
            Situação
            <select
              value={tenantFilter}
              onChange={(e) => {
                setTenantFilter(e.target.value as typeof tenantFilter);
              }}
            >
              <option value="trial">Em teste</option>
              <option value="past_due">Pagamento pendente</option>
              <option value="suspended">Suspensos</option>
            </select>
          </label>
        </header>
        {tenants.isPending ? (
          <div className="platform-table-skeleton">
            <i className="platform-skeleton" />
            <i className="platform-skeleton" />
          </div>
        ) : tenants.error instanceof Error ? (
          <ErrorState
            message="Não foi possível carregar os estabelecimentos."
            retry={() => {
              void tenants.refetch();
            }}
          />
        ) : !tenants.data?.items.length ? (
          <div className="platform-empty">
            <p>Nenhum estabelecimento encontrado para esta situação.</p>
          </div>
        ) : (
          <div className="platform-table-wrap">
            <table className="platform-table platform-commercial-table">
              <thead>
                <tr>
                  <th>Estabelecimento</th>
                  <th>Situação</th>
                  <th>Trial/Período</th>
                  <th>Próxima mudança</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {tenants.data.items.map((t) => (
                  <tr key={t.publicId}>
                    <td>
                      <strong>{t.displayName}</strong>
                    </td>
                    <td>
                      {t.subscription ? (
                        <StatusBadge value={t.subscription.status} />
                      ) : (
                        <span>Sem assinatura</span>
                      )}
                    </td>
                    <td>
                      {t.subscription?.trialEndsAt
                        ? `até ${formatDate(t.subscription.trialEndsAt)}`
                        : t.subscription?.currentPeriodEndsAt
                          ? `até ${formatDate(t.subscription.currentPeriodEndsAt)}`
                          : '—'}
                    </td>
                    <td>
                      {t.subscription?.currentPeriodEndsAt
                        ? formatDate(t.subscription.currentPeriodEndsAt)
                        : '—'}
                    </td>
                    <td>
                      {t.subscription?.status === 'SUSPENDED' ? (
                        <button
                          disabled={reactivate.isPending}
                          onClick={() => {
                            requestReactivation(t.subscription?.publicId ?? '', t.displayName);
                          }}
                          type="button"
                        >
                          Reativar
                        </button>
                      ) : (
                        <span>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {confirmation ? (
        <ConfirmationDialog
          request={confirmation}
          onClose={() => {
            setConfirmation(null);
          }}
        />
      ) : null}
    </section>
  );
}
