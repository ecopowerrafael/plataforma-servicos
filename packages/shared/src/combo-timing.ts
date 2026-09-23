import { blockedServiceMinutes } from './service.js';

export interface ComboItemTiming {
  serviceId: bigint;
  service: {
    durationMinutes: number;
    hasPostServiceBreak: boolean;
    postServiceBreakMinutes: number;
  };
  link?: {
    durationMinutes: number | null;
    hasPostServiceBreak: boolean | null;
    postServiceBreakMinutes: number | null;
  };
}

/**
 * Resolve combo timing with professional service link overrides.
 *
 * Pure function: no queries, no side effects.
 * Items must be pre-loaded with their service data and optional link overrides.
 *
 * Combo must have at least one item.
 * For each item, resolves duration/break considering ProfessionalService overrides.
 * Aggregates: durationMinutes includes intermediate breaks, postServiceBreakMinutes is final break only.
 *
 * Invariant: blockedMinutes === sum(blockedServiceMinutes for each item)
 */
export function resolveComboTiming(items: ComboItemTiming[]): {
  durationMinutes: number;
  postServiceBreakMinutes: number;
  blockedMinutes: number;
} {
  if (items.length === 0) {
    throw new Error('Combo must have at least one item');
  }

  let durationMinutes = 0;
  let postServiceBreakMinutes = 0;
  let summedBlocked = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item) {
      throw new Error(`Invalid combo item at index ${index}`);
    }

    const link = item.link;

    const resolvedDuration = link?.durationMinutes ?? item.service.durationMinutes;
    const resolvedHasBreak = link?.hasPostServiceBreak ?? item.service.hasPostServiceBreak;
    const resolvedBreak = resolvedHasBreak
      ? (link?.postServiceBreakMinutes ?? item.service.postServiceBreakMinutes)
      : 0;

    const itemBlocked = blockedServiceMinutes(resolvedDuration, resolvedHasBreak, resolvedBreak);
    summedBlocked += itemBlocked;

    const isLastItem = index === items.length - 1;
    if (!isLastItem) {
      // For intermediate items: include both duration and break in durationMinutes
      durationMinutes += resolvedDuration + resolvedBreak;
    } else {
      // For last item: duration in durationMinutes, break in postServiceBreakMinutes
      durationMinutes += resolvedDuration;
      postServiceBreakMinutes = resolvedBreak;
    }
  }

  const blockedMinutes = durationMinutes + postServiceBreakMinutes;

  // Invariant check
  if (blockedMinutes !== summedBlocked) {
    throw new Error(
      `Combo timing invariant violated: calculated ${blockedMinutes} but sum of items is ${summedBlocked}`,
    );
  }

  return {
    durationMinutes,
    postServiceBreakMinutes,
    blockedMinutes,
  };
}
