import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';

/**
 * Gera um ID único para o worker (por processo).
 * Combinação de hostname + PID + UUID curto.
 * O mesmo processo sempre usa o mesmo ID.
 */
export function generateWorkerId(): string {
  const host = hostname().substring(0, 20);
  const pid = process.pid.toString().padStart(5, '0');
  const uuid = randomUUID().substring(0, 8);
  return `${host}-${pid}-${uuid}`;
}
