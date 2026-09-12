import { type CustomerSegmentSchema } from '@plataforma/shared';
import { type z } from 'zod';

export type CustomerSegment = z.infer<typeof CustomerSegmentSchema>;

/**
 * Janelas de relacionamento. Vêm das regras do módulo de Recuperação do próprio
 * estabelecimento — nada de número mágico escondido aqui.
 */
export interface RelationshipWindows {
  /** Dias sem retorno após um atendimento concluído (regra POST_SERVICE_NO_RETURN). */
  noReturnAfterDays: number | null;
  /** Dias sem qualquer movimento para considerar inativo (regra INACTIVE). */
  inactiveAfterDays: number | null;
  /** Janela usada para classificar um cadastro como novo. */
  newWithinDays: number;
}

export interface RelationshipInput {
  createdAt: Date;
  completedCount: number;
  lastCompletedAt: Date | null;
  nextAppointmentAt: Date | null;
}

const daysBetween = (from: Date, to: Date) =>
  Math.floor((to.getTime() - from.getTime()) / 86_400_000);

export const daysSince = (value: Date | null, now: Date) =>
  value === null ? null : Math.max(daysBetween(value, now), 0);

/**
 * Segmentos derivados: nenhum é persistido e nenhum depende de estado inventado.
 * Um cliente pode estar em mais de um segmento (recorrente e sem retorno, por exemplo).
 */
export function deriveSegments(
  input: RelationshipInput,
  windows: RelationshipWindows,
  now: Date,
): CustomerSegment[] {
  const segments: CustomerSegment[] = [];
  if (daysBetween(input.createdAt, now) <= windows.newWithinDays) segments.push('NEW');
  if (input.completedCount > 1) segments.push('RECURRING');
  if (input.nextAppointmentAt !== null && input.nextAppointmentAt.getTime() >= now.getTime())
    segments.push('SCHEDULED');

  const idle = daysSince(input.lastCompletedAt, now);
  const hasFuture =
    input.nextAppointmentAt !== null && input.nextAppointmentAt.getTime() >= now.getTime();
  if (
    !hasFuture &&
    idle !== null &&
    windows.noReturnAfterDays !== null &&
    idle >= windows.noReturnAfterDays
  )
    segments.push('NO_RETURN');
  if (
    !hasFuture &&
    windows.inactiveAfterDays !== null &&
    (idle === null
      ? daysBetween(input.createdAt, now) >= windows.inactiveAfterDays
      : idle >= windows.inactiveAfterDays)
  )
    segments.push('INACTIVE');
  return segments;
}

/** Intervalo médio, em dias, entre atendimentos concluídos. Nulo com menos de dois. */
export function averageIntervalDays(completedDates: Date[]): number | null {
  if (completedDates.length < 2) return null;
  const sorted = [...completedDates].sort((left, right) => left.getTime() - right.getTime());
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) return null;
  const span = daysBetween(first, last);
  const interval = Math.round(span / (sorted.length - 1));
  return interval > 0 ? interval : null;
}

export function relationshipWindowsFromRules(
  rules: { rule: string; days: number; active: boolean }[],
): RelationshipWindows {
  const find = (name: string) => rules.find((rule) => rule.rule === name)?.days ?? null;
  return {
    noReturnAfterDays: find('POST_SERVICE_NO_RETURN'),
    inactiveAfterDays: find('INACTIVE'),
    newWithinDays: 30,
  };
}

/** Elegível para recuperação: sem retorno/inativo e com a regra correspondente ligada. */
export function isRecoveryEligible(
  segments: CustomerSegment[],
  rules: { rule: string; days: number; active: boolean }[],
): boolean {
  const active = (name: string) =>
    rules.some((rule) => rule.rule === name && rule.active);
  if (segments.includes('INACTIVE') && active('INACTIVE')) return true;
  return segments.includes('NO_RETURN') && active('POST_SERVICE_NO_RETURN');
}
