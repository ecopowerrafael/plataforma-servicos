/* eslint-disable @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-confusing-void-expression */
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateCommercialPlanRequestSchema, TenantCommercialPolicySchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { type ChangeEvent, useEffect, useState } from 'react';
import { Controller, FormProvider, useForm, useWatch } from 'react-hook-form';

import { PlanBenefitsEditor } from './PlanBenefitsEditor.js';
import { PlanLimitsEditor } from './PlanLimitsEditor.js';
import { PlanPreviewCard, type PlanPreviewValue } from './PlanPreviewCard.js';
import { httpClient } from '../../lib/http.js';
import { brazilianMoneyToCents, centsToBrazilianMoney } from '../../marketing/pricing.js';

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
const planCode = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function MoneyInput({
  value,
  onChange,
  onBlur,
  placeholder,
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  onBlur: () => void;
  placeholder: string;
}) {
  const [text, setText] = useState(centsToBrazilianMoney(value));
  return (
    <input
      inputMode="decimal"
      placeholder={placeholder}
      value={text}
      onBlur={onBlur}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        onChange(brazilianMoneyToCents(next));
      }}
    />
  );
}

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
      monthlyPriceCents: undefined,
      annualPriceCents: undefined,
      billingOptions: [
        { billingCycle: 'MONTHLY', priceCents: 0, active: true, sortOrder: 0, recommended: true },
        { billingCycle: 'QUARTERLY', priceCents: 0, active: false, sortOrder: 1, recommended: false },
        { billingCycle: 'SEMIANNUAL', priceCents: 0, active: false, sortOrder: 2, recommended: false },
        { billingCycle: 'ANNUAL', priceCents: 0, active: false, sortOrder: 3, recommended: false },
      ],
      currency: 'BRL',
      trialDays: undefined,
      isPublic: false,
      highlighted: false,
      badge: undefined,
      ctaText: undefined,
      sortOrder: 0,
      limits: [
        { key: 'units.max', valueType: 'INTEGER', integerValue: 1 },
        { key: 'professionals.max', valueType: 'INTEGER', integerValue: 1 },
        { key: 'members.max', valueType: 'INTEGER', integerValue: 1 },
        { key: 'services.max', valueType: 'INTEGER', integerValue: 1 },
        { key: 'monthly_appointments.max', valueType: 'INTEGER', integerValue: null },
        { key: 'custom_domain.enabled', valueType: 'BOOLEAN', booleanValue: false },
        { key: 'branding.customization.enabled', valueType: 'BOOLEAN', booleanValue: false },
        { key: 'advanced_reports.enabled', valueType: 'BOOLEAN', booleanValue: false },
        { key: 'products.enabled', valueType: 'BOOLEAN', booleanValue: false },
        { key: 'stock.enabled', valueType: 'BOOLEAN', booleanValue: false },
        { key: 'commissions.enabled', valueType: 'BOOLEAN', booleanValue: false },
        { key: 'waitlist.enabled', valueType: 'BOOLEAN', booleanValue: false },
        { key: 'automations.enabled', valueType: 'BOOLEAN', booleanValue: false },
        { key: 'whatsapp.enabled', valueType: 'BOOLEAN', booleanValue: false },
        { key: 'integrations.enabled', valueType: 'BOOLEAN', booleanValue: false },
        { key: 'loyalty.enabled', valueType: 'BOOLEAN', booleanValue: false },
        { key: 'coupons.enabled', valueType: 'BOOLEAN', booleanValue: false },
      ],
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
    monthlyPriceCents: plan.monthlyPriceCents === null ? undefined : Number(plan.monthlyPriceCents),
    annualPriceCents: plan.annualPriceCents === null ? undefined : Number(plan.annualPriceCents),
    billingOptions: plan.billingOptions.length > 0
      ? plan.billingOptions.map((option) => ({ ...option, priceCents: Number(option.priceCents) }))
      : [
          { billingCycle: 'MONTHLY', priceCents: Number(plan.monthlyPriceCents ?? plan.priceCents), active: plan.billingCycle === 'MONTHLY', sortOrder: 0, recommended: plan.billingCycle === 'MONTHLY' },
          { billingCycle: 'QUARTERLY', priceCents: 0, active: false, sortOrder: 1, recommended: false },
          { billingCycle: 'SEMIANNUAL', priceCents: 0, active: false, sortOrder: 2, recommended: false },
          { billingCycle: 'ANNUAL', priceCents: Number(plan.annualPriceCents ?? plan.priceCents), active: plan.billingCycle === 'ANNUAL', sortOrder: 3, recommended: plan.billingCycle === 'ANNUAL' },
        ],
    currency: plan.currency,
    trialDays: plan.trialDays ?? undefined,
    isPublic: plan.isPublic,
    highlighted: plan.highlighted,
    badge: plan.badge ?? undefined,
    ctaText: plan.ctaText ?? undefined,
    sortOrder: plan.sortOrder,
    limits: (['units.max', 'professionals.max', 'members.max', 'services.max', 'monthly_appointments.max', 'custom_domain.enabled', 'branding.customization.enabled', 'advanced_reports.enabled', 'products.enabled', 'stock.enabled', 'commissions.enabled', 'waitlist.enabled', 'automations.enabled', 'whatsapp.enabled', 'integrations.enabled', 'loyalty.enabled', 'coupons.enabled'] as const).map((key) => {
      const limit = plan.limits.find((item) => item.key === key);
      return key.endsWith('.enabled')
        ? { key, valueType: 'BOOLEAN' as const, booleanValue: limit?.booleanValue ?? false }
        : { key, valueType: 'INTEGER' as const, integerValue: limit?.integerValue === null ? null : Number(limit?.integerValue ?? 1) };
    }),
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
            <small>Identificador interno do plano. Gerado automaticamente.</small>
          </label>
        ) : (
          <p className="muted">{`C\u00f3digo: ${plan.code}`}</p>
        )}
        <label>
          Nome
          <input {...register('name', { onChange: (event: ChangeEvent<HTMLInputElement>) => { if (plan === undefined) { setValue('code', planCode(event.target.value), { shouldValidate: true }); } } })} />
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
        <fieldset className="plan-billing-options">
          <legend>Preços e periodicidades</legend>
          {(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'] as const).map((cycle, index) => (
            <div className="billing-option" key={cycle}>
              <strong>{({ MONTHLY: 'Mensal', QUARTERLY: 'Trimestral', SEMIANNUAL: 'Semestral', ANNUAL: 'Anual' })[cycle]}</strong>
              <input type="hidden" {...register(`billingOptions.${index}.billingCycle`)} />
              <input type="hidden" {...register(`billingOptions.${index}.sortOrder`, { valueAsNumber: true })} />
              <Controller control={control} name={`billingOptions.${index}.priceCents`} render={({ field }) => <MoneyInput value={field.value as number | undefined} onChange={field.onChange} onBlur={field.onBlur} placeholder="59,90" />} />
              <label><input type="checkbox" {...register(`billingOptions.${index}.active`)} /> Ativo</label>
              <label><input type="checkbox" checked={formValues.billingOptions?.[index]?.recommended === true} onChange={(event) => { formValues.billingOptions?.forEach((_, optionIndex) => setValue(`billingOptions.${optionIndex}.recommended`, event.target.checked && optionIndex === index)); }} /> Recomendado</label>
            </div>
          ))}
        </fieldset>
        <fieldset className="legacy-billing-fields">
          <legend>Preços</legend>
          <label>
            Preço mensal (R$)
            <Controller
              control={control}
              name="monthlyPriceCents"
              render={({ field }) => (
                <MoneyInput
                  key={plan?.publicId ?? 'new-monthly'}
                  value={field.value as number | undefined}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="59,90"
                />
              )}
            />
          </label>
          <label>
            Preço anual (R$)
            <Controller
              control={control}
              name="annualPriceCents"
              render={({ field }) => (
                <MoneyInput
                  key={plan?.publicId ?? 'new-annual'}
                  value={field.value as number | undefined}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="599,00"
                />
              )}
            />
          </label>
          <small>Digite valores em reais; a Agendei armazena centavos com precisão.</small>
        </fieldset>
        <label className="legacy-cycle">
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
