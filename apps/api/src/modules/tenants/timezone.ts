/**
 * Conversões de dia civil no fuso do estabelecimento. Relatórios financeiros precisam
 * responder "o dia 15" como o dono entende — não como o UTC do servidor entende.
 */
/**
 * `Intl` lanca RangeError para fuso invalido (string vazia, "GMT-3", lixo de cadastro).
 * Um relatorio inteiro nao pode cair por causa disso: cai para UTC e segue.
 */
export const resolveTimezone = (value: string | null | undefined): string => {
  if (value === null || value === undefined || value.trim() === '') return 'UTC';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value }).format(new Date());
    return value;
  } catch {
    return 'UTC';
  }
};

const formatter = (timezone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

const parts = (date: Date, timezone: string) =>
  Object.fromEntries(
    formatter(timezone)
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

/** Dia civil (YYYY-MM-DD) do instante, no fuso informado. */
export const zonedDayKey = (date: Date, timezone: string) => {
  const value = parts(date, timezone);
  return `${value.year ?? '0000'}-${value.month ?? '01'}-${value.day ?? '01'}`;
};

export const zonedMonthKey = (date: Date, timezone: string) =>
  zonedDayKey(date, timezone).slice(0, 7);

/**
 * Instante da meia-noite do dia civil informado, no fuso do estabelecimento.
 * Duas iterações resolvem a virada de horário de verão.
 */
export const zonedDayStart = (day: string, timezone: string) => {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  const target = Date.UTC(year, month - 1, date, 0, 0);
  let guess = new Date(target);
  for (let index = 0; index < 2; index += 1) {
    const value = parts(guess, timezone);
    const current = Date.UTC(
      Number(value.year),
      Number(value.month) - 1,
      Number(value.day),
      Number(value.hour),
      Number(value.minute),
    );
    guess = new Date(guess.getTime() + (target - current));
  }
  return guess;
};

/** Soma dias a um dia civil (YYYY-MM-DD) sem depender de fuso. */
export const addDaysToDay = (day: string, amount: number) => {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, date + amount));
  return value.toISOString().slice(0, 10);
};

/** Quantidade de dias civis entre dois dias (fim exclusivo). */
export const daysBetweenDays = (from: string, to: string) => {
  const start = new Date(`${from}T00:00:00.000Z`).getTime();
  const end = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.max(Math.round((end - start) / 86_400_000), 1);
};
