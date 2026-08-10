/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { useFormContext, useWatch } from 'react-hook-form';

import type { PlanFormInput } from './PlanEditForm.js';

const usageLimits = [
  ['units.max', 'Unidades'],
  ['professionals.max', 'Profissionais'],
  ['members.max', 'Usuários da equipe'],
  ['services.max', 'Serviços'],
  ['monthly_appointments.max', 'Agendamentos/mês'],
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
            <label><input checked={limits?.[index]?.integerValue === null} onChange={(event) => { setValue(`limits.${index}.integerValue`, event.target.checked ? null : 1); }} type="checkbox" /> Ilimitado</label>
          </div>
        ))}
      </fieldset>
      <fieldset className="plan-features">
        <legend>Recursos incluídos</legend>
        <label className="feature-switch">
          <input type="hidden" {...register('limits.5.key')} />
          <input type="hidden" {...register('limits.5.valueType')} />
          <input {...register('limits.5.booleanValue')} type="checkbox" />
          Domínio próprio
        </label>
      </fieldset>
    </>
  );
}
