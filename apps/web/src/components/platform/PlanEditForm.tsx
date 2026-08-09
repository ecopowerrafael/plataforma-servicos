import { zodResolver } from '@hookform/resolvers/zod';
import { CreateCommercialPlanRequestSchema } from '@plataforma/shared';
import { useEffect } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import { PlanLimitsEditor } from './PlanLimitsEditor.js';

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
      description: undefined,
      billingCycle: 'MONTHLY',
      priceCents: 0,
      currency: 'BRL',
      trialDays: 0,
      isPublic: false,
      sortOrder: 0,
      limits: [],
    };
  }
  return {
    code: plan.code,
    name: plan.name,
    description: plan.description ?? undefined,
    billingCycle: plan.billingCycle,
    priceCents: Number(plan.priceCents),
    currency: plan.currency,
    trialDays: plan.trialDays,
    isPublic: plan.isPublic,
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
    formState: { errors },
  } = form;
  useEffect(() => {
    reset(valuesFromPlan(plan));
  }, [plan, reset]);

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
          {'Dias de trial'}
          <input min="0" {...register('trialDays', { valueAsNumber: true })} type="number" />
        </label>
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
    </FormProvider>
  );
}
