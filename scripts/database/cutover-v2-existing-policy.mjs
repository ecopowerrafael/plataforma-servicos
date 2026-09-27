import { V2_STATES } from './v2-state-guard.mjs';

export function decideExistingCutover({ state, confirmation, backupConfirmed, schemaCompatible, whatsappReady, noDuplicate, noPartialBaseline }) {
  if (state === V2_STATES.READY) return { allowed: true, idempotent: true };
  if (state !== V2_STATES.CUTOVER) return { allowed: false, reason: state };
  return { allowed: Boolean(confirmation && backupConfirmed && schemaCompatible && whatsappReady && noDuplicate && noPartialBaseline), idempotent: false, reason: 'preconditions' };
}
