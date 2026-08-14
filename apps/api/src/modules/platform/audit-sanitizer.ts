import { type Prisma } from '../../database-client/client.js';

const sensitiveKey = /(?:password|passwordhash|passwd|token|secret|apikey|authorization|credential|smtp|gateway|paymentcredential)/iu;

export function sanitizeAuditValue(value: Prisma.JsonValue): Prisma.JsonValue {
  if (Array.isArray(value)) return value.map(sanitizeAuditValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sensitiveKey.test(key.replaceAll(/[_-]/gu, ''))
          ? '[protegido]'
          : item === undefined
            ? null
            : sanitizeAuditValue(item),
      ]),
    );
  }
  return value;
}

export function auditReadDetails(metadata: Prisma.JsonValue | null) {
  if (metadata === null || Array.isArray(metadata) || typeof metadata !== 'object') {
    return { reason: null, metadata: metadata === null ? null : sanitizeAuditValue(metadata), before: null, after: null };
  }
  const sanitized = sanitizeAuditValue(metadata) as Prisma.JsonObject;
  const before: Prisma.JsonObject = {};
  const after: Prisma.JsonObject = {};
  for (const [key, value] of Object.entries(sanitized)) {
    if (key.startsWith('previous') && key.length > 8) before[key.slice(8).replace(/^./u, (letter) => letter.toLowerCase())] = value;
    if (key.startsWith('new') && key.length > 3) after[key.slice(3).replace(/^./u, (letter) => letter.toLowerCase())] = value;
  }
  return {
    reason: typeof sanitized.reason === 'string' ? sanitized.reason : null,
    metadata: sanitized,
    before: Object.keys(before).length > 0 ? before : null,
    after: Object.keys(after).length > 0 ? after : null,
  };
}
