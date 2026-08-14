/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateCommercialPlanRequestSchema,
  TenantCommercialPolicySchema,
} from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { type ChangeEvent, type ReactNode, useEffect, useState } from 'react';
import { Controller, FormProvider, useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router-dom';

import {
  billingCycleLabels,
  billingCycles,
  deriveLegacyBillingFields,
  normalizeBillingOptions,
  setBillingOptionEnabled,
  setRecommendedBillingOption,
  type PlanBillingOptions,
} from './plan-billing-options.js';
import { PlanBenefitsEditor } from './PlanBenefitsEditor.js';
import { PlanFeaturesEditor, PlanUsageLimitsEditor } from './PlanLimitsEditor.js';
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
        message: 'Informe um valor inteiro não negativo.',
        path: ['limits', index, 'integerValue'],
      });
    }
  });
});

export type PlanFormInput = z.input<typeof PlanFormSchema>;
export type PlanFormSubmission = z.output<typeof PlanFormSchema>;
type Plan = z.infer<typeof CommercialPlanPublicSchema>;

const planCode = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const sections = [
  { id: 'geral', label: 'Geral' },
  { id: 'precos', label: 'Preços' },
  { id: 'limites', label: 'Limites' },
  { id: 'recursos', label: 'Recursos' },
  { id: 'comercial', label: 'Comercial' },
] as const;
type SectionId = (typeof sections)[number]['id'];

function MoneyInput({
  value,
  onChange,
  onBlur,
  placeholder,
  ariaLabel,
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  onBlur: () => void;
  placeholder: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(centsToBrazilianMoney(value));
  return (
    <input
      aria-label={ariaLabel}
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
        {
          billingCycle: 'QUARTERLY',
          priceCents: 0,
          active: false,
          sortOrder: 1,
          recommended: false,
        },
        {
          billingCycle: 'SEMIANNUAL',
          priceCents: 0,
          active: false,
          sortOrder: 2,
          recommended: false,
        },
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
    billingOptions: normalizeBillingOptions(
      plan.billingOptions.length > 0
        ? plan.billingOptions.map((option) => ({
            ...option,
            priceCents: Number(option.priceCents),
          }))
        : [
            {
              billingCycle: 'MONTHLY',
              priceCents: Number(plan.monthlyPriceCents ?? plan.priceCents),
              active: plan.billingCycle === 'MONTHLY',
              sortOrder: 0,
              recommended: plan.billingCycle === 'MONTHLY',
            },
            {
              billingCycle: 'QUARTERLY',
              priceCents: 0,
              active: false,
              sortOrder: 1,
              recommended: false,
            },
            {
              billingCycle: 'SEMIANNUAL',
              priceCents: 0,
              active: false,
              sortOrder: 2,
              recommended: false,
            },
            {
              billingCycle: 'ANNUAL',
              priceCents: Number(plan.annualPriceCents ?? plan.priceCents),
              active: plan.billingCycle === 'ANNUAL',
              sortOrder: 3,
              recommended: plan.billingCycle === 'ANNUAL',
            },
          ],
    ),
    currency: plan.currency,
    trialDays: plan.trialDays ?? undefined,
    isPublic: plan.isPublic,
    highlighted: plan.highlighted,
    badge: plan.badge ?? undefined,
    ctaText: plan.ctaText ?? undefined,
    sortOrder: plan.sortOrder,
    limits: (
      [
        'units.max',
        'professionals.max',
        'members.max',
        'services.max',
        'monthly_appointments.max',
        'custom_domain.enabled',
        'branding.customization.enabled',
        'advanced_reports.enabled',
        'products.enabled',
        'stock.enabled',
        'commissions.enabled',
        'waitlist.enabled',
        'automations.enabled',
        'whatsapp.enabled',
        'integrations.enabled',
        'loyalty.enabled',
        'coupons.enabled',
      ] as const
    ).map((key) => {
      const limit = plan.limits.find((item) => item.key === key);
      return key.endsWith('.enabled')
        ? { key, valueType: 'BOOLEAN' as const, booleanValue: limit?.booleanValue ?? false }
        : {
            key,
            valueType: 'INTEGER' as const,
            integerValue: limit?.integerValue === null ? null : Number(limit?.integerValue ?? 1),
          };
    }),
  };
}

/** Cartão branco com título — bloco base da tela de configuração. */
function Block({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="plan-block">
      <header>
        <h3>{title}</h3>
        {description === undefined ? null : <p>{description}</p>}
      </header>
      {children}
    </section>
  );
}

export function PlanEditForm({
  busy,
  error,
  plan,
  onSave,
  statusBadge,
  statusActions,
}: {
  busy: boolean;
  error: string | null;
  plan?: Plan;
  onSave: (value: PlanFormSubmission) => Promise<void>;
  statusBadge?: ReactNode;
  statusActions?: ReactNode;
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
    formState: { errors, isDirty },
  } = form;
  const [section, setSection] = useState<SectionId>('geral');
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
  const options = normalizeBillingOptions((formValues.billingOptions ?? []) as PlanBillingOptions);
  const applyOptions = (next: PlanBillingOptions) => {
    setValue('billingOptions', next, { shouldDirty: true, shouldValidate: true });
  };

  const submit = (value: PlanFormSubmission) =>
    onSave({
      ...value,
      ...deriveLegacyBillingFields(value.billingOptions, {
        billingCycle: value.billingCycle,
        priceCents: value.priceCents,
      }),
    });

  return (
    <FormProvider {...form}>
      <form
        className="plan-editor"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit(submit)();
        }}
      >
        <header className="plan-editor-topbar">
          <div className="plan-editor-identity">
            <h2>
              {plan === undefined ? 'Criar plano' : `Editar plano ${formValues.name ?? plan.name}`}
              {statusBadge}
            </h2>
            <p>Edite as configurações e limites deste plano.</p>
          </div>
          <div className="plan-editor-topbar-actions">
            {plan === undefined ? null : (
              <a
                className="button button--secondary"
                href="/planos"
                rel="noreferrer"
                target="_blank"
              >
                {'Visualizar como cliente ↗'}
              </a>
            )}
            <Link className="button button--secondary" to="/platform/plans">
              Cancelar
            </Link>
            <button disabled={busy || !isDirty} type="submit">
              {busy ? 'Salvando…' : plan === undefined ? 'Criar plano' : 'Salvar alterações'}
            </button>
          </div>
        </header>

        <nav aria-label="Seções do plano" className="plan-editor-tabs">
          {sections.map((item) => (
            <button
              aria-current={section === item.id}
              className={section === item.id ? 'is-active' : ''}
              key={item.id}
              onClick={() => {
                setSection(item.id);
              }}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>

        {plan === undefined ? <input type="hidden" {...register('code')} /> : null}
        <input type="hidden" {...register('billingCycle')} />
        <input type="hidden" {...register('priceCents', { valueAsNumber: true })} />
        <input type="hidden" {...register('monthlyPriceCents', { valueAsNumber: true })} />
        <input type="hidden" {...register('annualPriceCents', { valueAsNumber: true })} />

        <div className="plan-editor-layout">
          <div className="plan-editor-main">
            {section === 'geral' && (
              <Block title="Informações gerais">
                <div className="plan-field-grid plan-field-grid--halves">
                  <label>
                    Nome do plano
                    <input
                      {...register('name', {
                        onChange: (event: ChangeEvent<HTMLInputElement>) => {
                          if (plan === undefined) {
                            setValue('code', planCode(event.target.value), {
                              shouldValidate: true,
                            });
                          }
                        },
                      })}
                    />
                  </label>
                  <label>
                    Descrição
                    <input
                      maxLength={240}
                      placeholder="Plano ideal para pequenos estabelecimentos"
                      {...register('shortDescription', {
                        setValueAs: (value: string) => (value.trim() === '' ? undefined : value),
                      })}
                    />
                  </label>
                </div>
                <div className="plan-field-grid plan-field-grid--quarters">
                  <label>
                    Moeda
                    <select {...register('currency')}>
                      <option value="BRL">{'BRL (R$)'}</option>
                      <option value="USD">{'USD ($)'}</option>
                      <option value="EUR">{'EUR (€)'}</option>
                    </select>
                  </label>
                  <label>
                    Ordem
                    <input
                      min="0"
                      type="number"
                      {...register('sortOrder', { valueAsNumber: true })}
                    />
                  </label>
                  <Controller
                    control={control}
                    name="isPublic"
                    render={({ field }) => (
                      <div className="plan-toggle-field">
                        <span className="plan-field-label">Plano público</span>
                        <label className="plan-toggle-inline">
                          <input
                            aria-label="Plano público"
                            checked={field.value ?? false}
                            className="ds-switch"
                            onChange={(event) => {
                              field.onChange(event.target.checked);
                            }}
                            role="switch"
                            type="checkbox"
                          />
                          <small>Exibir para novos estabelecimentos</small>
                        </label>
                      </div>
                    )}
                  />
                  <Controller
                    control={control}
                    name="highlighted"
                    render={({ field }) => (
                      <div className="plan-toggle-field">
                        <span className="plan-field-label">Destaque</span>
                        <label className="plan-toggle-inline">
                          <input
                            aria-label="Destaque"
                            checked={field.value ?? false}
                            className="ds-switch"
                            onChange={(event) => {
                              field.onChange(event.target.checked);
                            }}
                            role="switch"
                            type="checkbox"
                          />
                          <small>Destacar este plano na vitrine</small>
                        </label>
                      </div>
                    )}
                  />
                </div>
                <div className="plan-field-grid plan-field-grid--halves">
                  <label>
                    {'Selo (badge)'}
                    <input
                      maxLength={40}
                      placeholder="Mais popular"
                      {...register('badge', {
                        setValueAs: (value: string) => (value.trim() === '' ? undefined : value),
                      })}
                    />
                    <small>Texto exibido no selo do plano</small>
                  </label>
                  <label>
                    {'Texto do botão (CTA)'}
                    <input
                      maxLength={60}
                      placeholder="Começar grátis"
                      {...register('ctaText', {
                        setValueAs: (value: string) => (value.trim() === '' ? undefined : value),
                      })}
                    />
                    <small>Texto do botão de ação principal</small>
                  </label>
                </div>
                <label className="plan-field-full">
                  Descrição completa
                  <textarea
                    placeholder="Texto interno e detalhado sobre o plano"
                    {...register('description', {
                      setValueAs: (value: string) => (value.trim() === '' ? null : value),
                    })}
                  />
                </label>
              </Block>
            )}

            {section === 'precos' && (
              <Block title="Preços e periodicidades">
                <table className="plan-price-table">
                  <thead>
                    <tr>
                      <th scope="col">Periodicidade</th>
                      <th scope="col">Preço</th>
                      <th scope="col">Ativo</th>
                      <th scope="col">Recomendado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billingCycles.map((cycle, index) => (
                      <tr key={cycle}>
                        <th scope="row">{billingCycleLabels[cycle]}</th>
                        <td>
                          <input
                            type="hidden"
                            {...register(`billingOptions.${index}.billingCycle`)}
                          />
                          <input
                            type="hidden"
                            {...register(`billingOptions.${index}.sortOrder`, {
                              valueAsNumber: true,
                            })}
                          />
                          <Controller
                            control={control}
                            name={`billingOptions.${index}.priceCents`}
                            render={({ field }) => (
                              <span className="plan-money-field">
                                <span>R$</span>
                                <MoneyInput
                                  ariaLabel={`Preço ${billingCycleLabels[cycle]}`}
                                  value={field.value as number | undefined}
                                  onChange={field.onChange}
                                  onBlur={field.onBlur}
                                  placeholder="59,00"
                                />
                              </span>
                            )}
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Ativar ${billingCycleLabels[cycle]}`}
                            checked={options[index]?.active === true}
                            className="ds-switch"
                            onChange={(event) => {
                              applyOptions(
                                setBillingOptionEnabled(options, cycle, event.target.checked),
                              );
                            }}
                            role="switch"
                            type="checkbox"
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Recomendar ${billingCycleLabels[cycle]}`}
                            checked={options[index]?.recommended === true}
                            name="recommended-billing-cycle"
                            onChange={() => {
                              applyOptions(
                                setRecommendedBillingOption(
                                  setBillingOptionEnabled(options, cycle, true),
                                  cycle,
                                  true,
                                ),
                              );
                            }}
                            type="radio"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="plan-hint">
                  A periodicidade recomendada será destacada para o cliente.
                </p>
              </Block>
            )}

            {section === 'limites' && (
              <Block
                title="Limites de uso"
                description="Deixe em branco marcando “Ilimitado” quando o plano não tiver teto."
              >
                <PlanUsageLimitsEditor />
              </Block>
            )}

            {section === 'recursos' && (
              <Block title="Recursos incluídos">
                <PlanFeaturesEditor />
              </Block>
            )}

            {section === 'comercial' && (
              <>
                <Block title="Período de teste">
                  <div className="plan-radio-list">
                    <label>
                      <input
                        checked={trialInheritsDefault}
                        name="trial-mode"
                        onChange={() => {
                          setValue('trialDays', undefined, { shouldDirty: true });
                        }}
                        type="radio"
                      />
                      <span>
                        <strong>Usar configuração global</strong>
                        <small>
                          {defaultTrialDays === undefined
                            ? 'Aplicar a política comercial global'
                            : `${String(defaultTrialDays)} dias`}
                        </small>
                      </span>
                    </label>
                    <label>
                      <input
                        checked={!trialInheritsDefault}
                        name="trial-mode"
                        onChange={() => {
                          setValue('trialDays', defaultTrialDays ?? 0, { shouldDirty: true });
                        }}
                        type="radio"
                      />
                      <span>
                        <strong>Personalizar para este plano</strong>
                        <small>Sobrescreve o período global apenas neste plano</small>
                      </span>
                    </label>
                  </div>
                  {trialInheritsDefault ? null : (
                    <label className="plan-field-narrow">
                      Dias de teste
                      <input
                        min="0"
                        type="number"
                        {...register('trialDays', { valueAsNumber: true })}
                      />
                    </label>
                  )}
                </Block>
                {plan !== undefined && (
                  <Block
                    title="Benefícios comerciais"
                    description="Itens exibidos na página pública de planos."
                  >
                    <PlanBenefitsEditor benefits={plan.benefits} planPublicId={plan.publicId} />
                  </Block>
                )}
                {statusActions === undefined ? null : (
                  <Block
                    title="Disponibilidade do plano"
                    description="Alterações de status afetam imediatamente novas assinaturas."
                  >
                    <div className="plan-status-actions">{statusActions}</div>
                  </Block>
                )}
              </>
            )}

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
          </div>

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
        </div>
      </form>
    </FormProvider>
  );
}
