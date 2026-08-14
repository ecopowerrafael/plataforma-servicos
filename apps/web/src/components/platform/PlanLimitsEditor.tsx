/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { useFormContext, useWatch } from 'react-hook-form';

import type { PlanFormInput } from './PlanEditForm.js';

/** Ordem canônica dos limites no formulário — espelha `valuesFromPlan` em PlanEditForm. */
export const planLimitOrder = [
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
] as const;

export type PlanLimitKey = (typeof planLimitOrder)[number];

const limitIndex = (key: PlanLimitKey) => planLimitOrder.indexOf(key);

const usageLimits: [PlanLimitKey, string][] = [
  ['units.max', 'Unidades'],
  ['professionals.max', 'Profissionais'],
  ['members.max', 'Usuários da equipe'],
  ['services.max', 'Serviços'],
  ['monthly_appointments.max', 'Agendamentos/mês'],
];

export const planLimitLabels: Partial<Record<PlanLimitKey, string>> = Object.fromEntries([
  ...usageLimits,
  ['custom_domain.enabled', 'Domínio próprio'],
  ['branding.customization.enabled', 'Personalização da marca'],
  ['advanced_reports.enabled', 'Relatórios avançados'],
  ['products.enabled', 'Produtos'],
  ['stock.enabled', 'Estoque'],
  ['commissions.enabled', 'Comissões'],
  ['waitlist.enabled', 'Lista de espera'],
  ['automations.enabled', 'Automações'],
  ['whatsapp.enabled', 'WhatsApp'],
  ['integrations.enabled', 'Integrações externas'],
  ['loyalty.enabled', 'Fidelidade'],
  ['coupons.enabled', 'Cupons'],
]);

const featureGroups: { title: string; items: [PlanLimitKey, string][] }[] = [
  {
    title: 'Operação',
    items: [
      ['products.enabled', 'Produtos'],
      ['stock.enabled', 'Estoque'],
      ['commissions.enabled', 'Comissões'],
      ['waitlist.enabled', 'Lista de espera'],
    ],
  },
  {
    title: 'Marketing e relacionamento',
    items: [
      ['whatsapp.enabled', 'WhatsApp'],
      ['automations.enabled', 'Automações'],
      ['integrations.enabled', 'Integrações externas'],
      ['loyalty.enabled', 'Fidelidade'],
      ['coupons.enabled', 'Cupons'],
    ],
  },
  {
    title: 'Gestão',
    items: [
      ['advanced_reports.enabled', 'Relatórios avançados'],
      ['branding.customization.enabled', 'Personalização da marca'],
      ['custom_domain.enabled', 'Domínio próprio'],
    ],
  },
];

/** Grade de limites numéricos: um campo por limite, com opção "Ilimitado" logo abaixo. */
export function PlanUsageLimitsEditor() {
  const { control, register, setValue } = useFormContext<PlanFormInput>();
  const limits = useWatch({ control, name: 'limits' });
  return (
    <div className="plan-usage-grid">
      {usageLimits.map(([key, label]) => {
        const index = limitIndex(key);
        const unlimited = limits?.[index]?.integerValue === null;
        return (
          <div className="plan-usage-field" key={key}>
            <span className="plan-field-label">{label}</span>
            <input type="hidden" {...register(`limits.${index}.key`)} />
            <input type="hidden" {...register(`limits.${index}.valueType`)} />
            {/*
              O input some quando o limite é ilimitado. Mantê-lo montado e apenas `disabled` fazia o
              react-hook-form ler o campo como `undefined`, o que reprovava a validação do plano.
            */}
            {unlimited ? (
              <p className="plan-usage-unlimited">Ilimitado</p>
            ) : (
              <input
                min="0"
                type="number"
                {...register(`limits.${index}.integerValue`, { valueAsNumber: true })}
              />
            )}
            <label className="plan-unlimited-check">
              <input
                checked={unlimited}
                onChange={(event) => {
                  setValue(`limits.${index}.integerValue`, event.target.checked ? null : 1, {
                    shouldDirty: true,
                  });
                }}
                type="checkbox"
              />
              Ilimitado
            </label>
          </div>
        );
      })}
    </div>
  );
}

/** Matriz compacta de recursos booleanos, agrupada por área do produto. */
export function PlanFeaturesEditor() {
  const { control, register, setValue } = useFormContext<PlanFormInput>();
  const limits = useWatch({ control, name: 'limits' });
  return (
    <div className="plan-feature-groups">
      {featureGroups.map((group) => (
        <section className="plan-feature-group" key={group.title}>
          <h4>{group.title}</h4>
          <ul>
            {group.items.map(([key, label]) => {
              const index = limitIndex(key);
              const checked = limits?.[index]?.booleanValue === true;
              return (
                <li key={key}>
                  <input type="hidden" {...register(`limits.${index}.key`)} />
                  <input type="hidden" {...register(`limits.${index}.valueType`)} />
                  <label className="plan-feature-row">
                    <span>{label}</span>
                    <input
                      aria-label={label}
                      checked={checked}
                      className="ds-switch"
                      onChange={(event) => {
                        setValue(`limits.${index}.booleanValue`, event.target.checked, {
                          shouldDirty: true,
                        });
                      }}
                      role="switch"
                      type="checkbox"
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
