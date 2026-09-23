/**
 * Centraliza lógica de timezone para Prospecting.
 * Usa Intl.DateTimeFormat para cálculos timezone-aware.
 */
export class ProspectingClock {
  public constructor(private readonly timezone: string) {}

  /**
   * Obtém a hora atual no timezone configurado.
   */
  public now(): Date {
    return new Date();
  }

  /**
   * Converte um Date para minutos desde meia-noite no timezone configurado.
   * Útil para validar janela de horário (sendingStartMinutes, sendingEndMinutes).
   */
  public getMinutesOfDay(date: Date = new Date()): number {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: this.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
    const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);

    return hour * 60 + minute;
  }

  /**
   * Obtém o dia da semana no timezone configurado.
   * Retorna: 1 = segunda, 2 = terça, ..., 7 = domingo (padrão ISO/BR)
   */
  public getDayOfWeek(date: Date = new Date()): number {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: this.timezone,
      weekday: 'short',
    });

    const dayName = formatter.format(date);
    const dayMap: Record<string, number> = {
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
      Sun: 7,
    };

    return dayMap[dayName] ?? 1;
  }

  /**
   * Obtém o início do dia (00:00) no timezone configurado.
   */
  public startOfDay(date: Date = new Date()): Date {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: this.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const parts = formatter.formatToParts(date);
    const year = parseInt(parts.find((p) => p.type === 'year')?.value ?? '2000', 10);
    const month = parseInt(parts.find((p) => p.type === 'month')?.value ?? '01', 10);
    const day = parseInt(parts.find((p) => p.type === 'day')?.value ?? '01', 10);

    // Criar date em UTC representando 00:00 do dia no timezone
    // Depois converter de volta para UTC
    const tzDate = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`);

    // Calcular offset do timezone em relação a UTC
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDateUTC = new Date(date.toLocaleString('en-US', { timeZone: this.timezone }));
    const offset = tzDateUTC.getTime() - utcDate.getTime();

    return new Date(tzDate.getTime() - offset);
  }

  /**
   * Obtém o final do dia (23:59:59.999) no timezone configurado.
   */
  public endOfDay(date: Date = new Date()): Date {
    const start = this.startOfDay(date);
    return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  }

  /**
   * Verifica se está dentro de uma janela de horário no timezone configurado.
   * @param startMinutes Início (inclusive), ex: 540 = 09:00
   * @param endMinutes Fim (exclusivo), ex: 1080 = 18:00
   */
  public isWithinSendingWindow(startMinutes: number, endMinutes: number, date: Date = new Date()): boolean {
    const minutes = this.getMinutesOfDay(date);
    return minutes >= startMinutes && minutes < endMinutes;
  }

  /**
   * Verifica se o dia da semana é permitido.
   * @param allowedWeekdays Array de dias permitidos [1-7], ex: [1,2,3,4,5] = seg-sex
   */
  public isAllowedWeekday(allowedWeekdays: number[], date: Date = new Date()): boolean {
    const dayOfWeek = this.getDayOfWeek(date);
    return allowedWeekdays.includes(dayOfWeek);
  }
}
