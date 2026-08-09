import { type TenantCustomFieldResponseSchema } from '@plataforma/shared';
import { type z } from 'zod';

type Field = z.infer<typeof TenantCustomFieldResponseSchema>;

export function CustomFieldInputs({
  fields,
  getValue,
  setFieldValue,
}: {
  fields: Field[];
  getValue: (key: string) => unknown;
  setFieldValue: (key: string, value: unknown) => void;
}) {
  return (
    <>
      {fields
        .filter((field) => field.active)
        .map((field) => {
          const current = getValue(field.key);
          if (field.type === 'BOOLEAN')
            return (
              <label key={field.publicId}>
                <input
                  type="checkbox"
                  checked={current === true}
                  onChange={(event) => {
                    setFieldValue(field.key, event.target.checked);
                  }}
                />{' '}
                {field.label}
              </label>
            );
          if (field.type === 'SELECT')
            return (
              <label key={field.publicId}>
                {field.label}
                <select
                  value={typeof current === 'string' ? current : ''}
                  onChange={(event) => {
                    setFieldValue(field.key, event.target.value);
                  }}
                >
                  <option value="">Selecione</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            );
          if (field.type === 'MULTISELECT')
            return (
              <fieldset key={field.publicId}>
                <legend>{field.label}</legend>
                {(field.options ?? []).map((option) => {
                  const values: string[] = Array.isArray(current)
                    ? current.filter((value): value is string => typeof value === 'string')
                    : [];
                  return (
                    <label key={option}>
                      <input
                        type="checkbox"
                        checked={values.includes(option)}
                        onChange={(event) => {
                          setFieldValue(
                            field.key,
                            event.target.checked
                              ? [...values, option]
                              : values.filter((value) => value !== option),
                          );
                        }}
                      />{' '}
                      {option}
                    </label>
                  );
                })}
              </fieldset>
            );
          return (
            <label key={field.publicId}>
              {field.label}
              {field.type === 'TEXTAREA' ? (
                <textarea
                  defaultValue={typeof current === 'string' ? current : ''}
                  onChange={(event) => {
                    setFieldValue(field.key, event.target.value);
                  }}
                />
              ) : (
                <input
                  type={
                    field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text'
                  }
                  defaultValue={
                    typeof current === 'string' || typeof current === 'number'
                      ? String(current)
                      : ''
                  }
                  onChange={(event) => {
                    setFieldValue(
                      field.key,
                      field.type === 'NUMBER' ? Number(event.target.value) : event.target.value,
                    );
                  }}
                />
              )}
            </label>
          );
        })}
    </>
  );
}
