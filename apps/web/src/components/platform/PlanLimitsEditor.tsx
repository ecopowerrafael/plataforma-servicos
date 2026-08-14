/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { useFormContext, useWatch } from 'react-hook-form';

import { Switch } from '../ui/AppUi.js';

import type { PlanFormInput } from './PlanEditForm.js';

const usageLimits = [
  ['units.max', 'Unidades'],
  ['professionals.max', 'Profissionais'],
  ['members.max', 'Usuários da equipe'],
  ['services.max', 'Serviços'],
  ['monthly_appointments.max', 'Agendamentos/mês'],
] as const;
const featureLimits = [
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
] as const;

export function PlanLimitsEditor() {
  const { control, register, setValue } = useFormContext<PlanFormInput>();
  const limits = useWatch({ control, name: 'limits' });
  return (
    <>
      <fieldset className="plan-usage-limits">
        <legend>Limites de uso</legend>
        {usageLimits.map(([key, label], index) => (
          <div className="plan-limit-row" key={key}>
            <strong>{label}</strong>
            <input type="hidden" {...register(`limits.${index}.key`)} />
            <input type="hidden" {...register(`limits.${index}.valueType`)} />
            <input
              min="0"
              disabled={limits?.[index]?.integerValue === null}
              {...register(`limits.${index}.integerValue`, { valueAsNumber: true })}
              type="number"
            />
            <Switch
              checked={limits?.[index]?.integerValue === null}
              label="Ilimitado"
              onChange={(checked) => {
                setValue(`limits.${index}.integerValue`, checked ? null : 1);
              }}
            />
          </div>
        ))}
      </fieldset>
      <fieldset className="plan-features">
        <legend>Recursos incluídos</legend>
        {featureLimits.map(([key, label], position) => {
          const index = usageLimits.length + position;
          return (
            <div className="feature-switch" key={key}>
              <input type="hidden" {...register(`limits.${index}.key`)} />
              <input type="hidden" {...register(`limits.${index}.valueType`)} />
              <Switch
                checked={limits?.[index]?.booleanValue === true}
                label={label}
                onChange={(checked) => {
                  setValue(`limits.${index}.booleanValue`, checked);
                }}
              />
            </div>
          );
        })}
      </fieldset>
    </>
  );
}
