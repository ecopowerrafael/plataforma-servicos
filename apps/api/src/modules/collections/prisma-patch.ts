/**
 * Remove chaves com valor `undefined` de um objeto de patch parcial, preservando
 * `null` (limpeza explícita). Necessário porque `exactOptionalPropertyTypes` do
 * TypeScript rejeita `{ campo: undefined }` como equivalente a "campo ausente"
 * ao montar `data` para `prisma.<model>.update(...)`.
 */
export function withoutUndefined<T extends Record<string, unknown>>(
  input: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  const result = {} as { [K in keyof T]?: Exclude<T[K], undefined> };
  for (const key of Object.keys(input) as (keyof T)[]) {
    const value = input[key];
    if (value !== undefined) (result as Record<string, unknown>)[key as string] = value;
  }
  return result;
}
