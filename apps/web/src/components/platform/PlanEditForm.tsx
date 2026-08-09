import { zodResolver } from '@hookform/resolvers/zod';
import { CreateCommercialPlanRequestSchema, TenantCommercialPolicySchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';

import { PlanBenefitsEditor } from './PlanBenefitsEditor.js';
import { PlanLimitsEditor } from './PlanLimitsEditor.js';
import { PlanPreviewCard, type PlanPreviewValue } from './PlanPreviewCard.js';
import { httpClient } from '../../lib/http.js';

import type { CommercialPlanPublicSchema } from '@plataforma/shared';
import type { z } from 'zod';

const PlanFormSchema = CreateCommercialPlanRequestSchema.superRefine((value, context) => {
  const keys = new Set<string>();
  value.limits.forEach((limit, index) => {
    if (keys.has(limit.key)) {
      context.addIssue({
        code: 'custom',
        message: 'Cada limite deve utilizar uma chave diferente.',
        path: ['limits', index, 'key'],
      });
    }
    keys.add(limit.key);
    if (limit.valueType === 'INTEGER' && limit.integerValue === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Informe um valor inteiro n\u00e3o negativo.',
        path: ['limits', index, 'integerValue'],
      });
    }
  });
});

export type PlanFormInput = z.input<typeof PlanFormSchema>;
export type PlanFormSubmission = z.output<typeof PlanFormSchema>;
type Plan = z.infer<typeof CommercialPlanPublicSchema>;

function valuesFromPlan(plan?: Plan): PlanFormInput {
  if (plan === undefined) {
    return {
      code: '',
      name: '',
      subtitle: undefined,
      shortDescription: undefined,
      description: undefined,
      billingCycle: 'MONTHLY',
      priceCents: 0,
      currency: 'BRL',
      trialDays: undefined,
      isPublic: false,
      highlighted: false,
      badge: undefined,
      ctaText: undefined,
      sortOrder: 0,
      limits: [],
    };
  }
  return {
    code: plan.code,
    name: plan.name,
    subtitle: plan.subtitle ?? undefined,
    shortDescription: plan.shortDescription ?? undefined,
    description: plan.description ?? undefined,
    billingCycle: plan.billingCycle,
    priceCents: Number(plan.priceCents),
    currency: plan.currency,
    trialDays: plan.trialDays ?? undefined,
    isPublic: plan.isPublic,
    highlighted: plan.highlighted,
    badge: plan.badge ?? undefined,
    ctaText: plan.ctaText ?? undefined,
    sortOrder: plan.sortOrder,
    limits: plan.limits.map((limit) => ({
      key: limit.key,
      valueType: limit.valueType,
      integerValue: limit.integerValue === null ? undefined : Number(limit.integerValue),
      booleanValue: limit.booleanValue ?? undefined,
      stringValue: limit.stringValue ?? undefined,
    })),
  };
}

export function PlanEditForm({
  busy,
  error,
  plan,
  onSave,
}: {
  busy: boolean;
  error: string | null;
  plan?: Plan;
  onSave: (value: PlanFormSubmission) => Promise<void>;
}) {
  const form = useForm<PlanFormInput, unknown, PlanFormSubmission>({
    defaultValues: valuesFromPlan(plan),
    resolver: zodResolver(PlanFormSchema),
  });
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = form;
  useEffect(() => {
    reset(valuesFromPlan(plan));
  }, [plan, reset]);

  const policy = useQuery({
    queryKey: ['platform', 'commercial-policy'],
    queryFn: () =>
      httpClient.request('/platform/commercial-policy', { schema: TenantCommercialPolicySchema }),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const defaultTrialDays = policy.data?.defaultTrialDays;

  const formValues = useWatch({ control });
  const trialDays = formValues.trialDays;
  const trialInheritsDefault = typeof trialDays !== 'number';

  return (
    <FormProvider {...form}>
      <form
        className="platform-form"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit(onSave)();
        }}
      >
        <h3>{plan === undefined ? 'Criar plano' : 'Editar plano'}</h3>
        {plan === undefined ? (
          <label>
            {'C\u00f3digo'}
            <input {...register('code')} />
          </label>
        ) : (
          <p className="muted">{`C\u00f3digo: ${plan.code}`}</p>
        )}
        <label>
          Nome
          <input {...register('name')} />
        </label>
        <label>
          {'Subt\u00edtulo'}
          <input
            maxLength={160}
            placeholder="Ex.: Ideal para quem est\u00e1 come\u00e7ando"
            {...register('subtitle', {
              setValueAs: (value: string) => (value.trim() === '' ? undefined : value),
            })}
          />
        </label>
        <label>
          {'Descri\u00e7\u00e3o curta (card p\u00fablico)'}
          <input
            maxLength={240}
            placeholder="Resumo exibido no card de pre\u00e7os"
            {...register('shortDescription', {
              setValueAs: (value: string) => (value.trim() === '' ? undefined : value),
            })}
          />
        </label>
        <label>
          {'Descri\u00e7\u00e3o'}
          <textarea
            {...register('description', {
              setValueAs: (value: string) => (value.trim() === '' ? null : value),
            })}
          />
        </label>
        <label>
          {'Pre\u00e7o em centavos'}
          <input min="0" {...register('priceCents', { valueAsNumber: true })} type="number" />
        </label>
        <label>
          Ciclo
          <select {...register('billingCycle')}>
            <option value="MONTHLY">Mensal</option>
            <option value="QUARTERLY">Trimestral</option>
            <option value="SEMIANNUAL">Semestral</option>
            <option value="ANNUAL">Anual</option>
            <option value="CUSTOM">Personalizado</option>
          </select>
        </label>
        <label>
          <input
            checked={trialInheritsDefault}
            onChange={(event) => {
              setValue('trialDays', event.target.checked ? undefined : (defaultTrialDays ?? 0), {
                shouldDirty: true,
              });
            }}
            type="checkbox"
          />
          {defaultTrialDays === undefined
            ? ' Usar o padr\u00e3o global de trial'
            : ` Usar o padr\u00e3o global de trial (${String(defaultTrialDays)} dias)`}
        </label>
        {!trialInheritsDefault && (
          <label>
            {'Dias de trial (override deste plano)'}
            <input min="0" {...register('trialDays', { valueAsNumber: true })} type="number" />
          </label>
        )}
        <label>
          {'Moeda'}
          <input {...register('currency')} />
        </label>
        <label>
          Ordem
          <input min="0" {...register('sortOrder', { valueAsNumber: true })} type="number" />
        </label>
        <label>
          <input {...register('isPublic')} type="checkbox" />
          {' Exibir para novos estabelecimentos'}
        </label>
        <label>
          <input {...register('highlighted')} type="checkbox" />
          {' Destacar como plano recomendado'}
        </label>
        <label>
          {'Selo (badge)'}
          <input
            maxLength={40}
            placeholder="Ex.: Mais popular"
            {...register('badge', {
              setValueAs: (value: string) => (value.trim() === '' ? undefined : value),
            })}
          />
        </label>
        <label>
          {'Texto do bot\u00e3o (CTA)'}
          <input
            maxLength={60}
            placeholder="Padr\u00e3o: Come\u00e7ar gr\u00e1tis"
            {...register('ctaText', {
              setValueAs: (value: string) => (value.trim() === '' ? undefined : value),
            })}
          />
        </label>
        <PlanLimitsEditor />
        {Object.keys(errors).length > 0 && (
          <p className="form-error" role="alert">
            {'Revise os campos e limites informados.'}
          </p>
        )}
        {error !== null && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button disabled={busy} type="submit">
          {busy
            ? 'Salvando\u2026'
            : plan === undefined
              ? 'Criar plano'
              : 'Salvar altera\u00e7\u00f5es'}
        </button>
      </form>
      {plan !== undefined && <PlanBenefitsEditor benefits={plan.benefits} planPublicId={plan.publicId} />}
      <PlanPreviewCard
        benefitTexts={
          plan === undefined
            ? []
            : [...plan.benefits]
                .filter((benefit) => benefit.enabled)
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((benefit) => benefit.text)
        }
        defaultTrialDays={defaultTrialDays}
        value={formValues as PlanPreviewValue}
      />
    </FormProvider>
  );
}
