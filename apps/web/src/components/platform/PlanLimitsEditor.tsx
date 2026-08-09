import { PlanLimitCatalog, PlanLimitKeys } from '@plataforma/shared';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';

import type { PlanFormInput } from './PlanEditForm.js';

const limitKeys = PlanLimitKeys;

type LimitField = 'key' | 'valueType' | 'integerValue' | 'booleanValue' | 'stringValue';

function limitFieldPath<Field extends LimitField>(
  index: number,
  field: Field,
): `limits.${number}.${Field}` {
  return `limits.${index.toString()}.${field}` as `limits.${number}.${Field}`;
}

export function PlanLimitsEditor() {
  const { control, register, setValue } = useFormContext<PlanFormInput>();
  const { append, fields, remove } = useFieldArray({ control, name: 'limits' });
  const limits = useWatch({ control, name: 'limits' });

  return (
    <fieldset>
      <legend>Limites do plano</legend>
      {fields.map((field, index) => {
        const valueType = limits?.[index]?.valueType ?? 'INTEGER';
        const keyPath = limitFieldPath(index, 'key');
        const valueTypePath = limitFieldPath(index, 'valueType');
        const integerValuePath = limitFieldPath(index, 'integerValue');
        const booleanValuePath = limitFieldPath(index, 'booleanValue');
        const stringValuePath = limitFieldPath(index, 'stringValue');
        return (
          <div className="platform-form" key={field.id}>
            <label>
              Chave
              <select
                {...register(keyPath)}
                onChange={(event) => {
                  const key = event.target.value as (typeof limitKeys)[number];
                  const nextType = PlanLimitCatalog[key].valueType;
                  setValue(keyPath, key);
                  setValue(valueTypePath, nextType);
                  setValue(integerValuePath, nextType === 'INTEGER' ? 1 : undefined);
                  setValue(booleanValuePath, nextType === 'BOOLEAN' ? false : undefined);
                  setValue(stringValuePath, undefined);
                }}
              >
                {limitKeys.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tipo
              <input {...register(valueTypePath)} type="hidden" />
              <output>{valueType === 'INTEGER' ? 'Inteiro' : 'Booleano'}</output>
            </label>
            {valueType === 'INTEGER' ? (
              <label>
                Valor
                <input
                  min="0"
                  {...register(integerValuePath, { valueAsNumber: true })}
                  type="number"
                />
              </label>
            ) : valueType === 'BOOLEAN' ? (
              <label>
                Valor
                <input {...register(booleanValuePath)} type="checkbox" />
              </label>
            ) : null}
            <button
              onClick={() => {
                remove(index);
              }}
              type="button"
            >
              Remover limite
            </button>
          </div>
        );
      })}
      <button
        disabled={fields.length >= limitKeys.length}
        onClick={() => {
          append({ key: 'units.max', valueType: 'INTEGER', integerValue: 1 });
        }}
        type="button"
      >
        Adicionar limite
      </button>
    </fieldset>
  );
}
