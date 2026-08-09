import { createHash, randomBytes, randomUUID } from 'node:crypto';

export function generatePublicId(): string {
  return randomUUID();
}

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
