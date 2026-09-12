export async function persistLayoutAndAdvance(options: {
  theme: string;
  persistTheme: (theme: string) => Promise<unknown>;
  advance: (step: 'COLORS') => Promise<unknown>;
}): Promise<void> {
  await options.persistTheme(options.theme);
  await options.advance('COLORS');
}
