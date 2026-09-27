const SECRET = 'SUPER_SECRET_SENTINEL_987654';
const URL_KEY_PATTERN = /(?:MYSQL_PWD|DATABASE_URL|V2_DATABASE_URL|MYSQL_INTEGRATION_DATABASE_URL|MYSQL_SNAPSHOT_DATABASE_URL|DB_SCHEMA_BACKUP_DATABASE_URL|FRESH_INSTALL_DATABASE_URL|BASELINE_DATABASE_URL|VERIFY_DATABASE_URL)/i;

export function redact(value) {
  if (value instanceof Error) return redact(value.message);
  if (typeof value === 'string') {
    let result = value.replaceAll(SECRET, '[REDACTED]');
    result = result.replace(/(mysql:\/\/[^:\s/]+:)[^@\s]+(@)/gi, '$1***$2');
    result = result.replace(/((?:MYSQL_PWD|DATABASE_URL|V2_DATABASE_URL|MYSQL_INTEGRATION_DATABASE_URL|MYSQL_SNAPSHOT_DATABASE_URL|DB_SCHEMA_BACKUP_DATABASE_URL|FRESH_INSTALL_DATABASE_URL|BASELINE_DATABASE_URL|VERIFY_DATABASE_URL)\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]');
    result = result.replace(/(--password(?:=|\s+))[^\s]+/gi, '$1***');
    return result;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, URL_KEY_PATTERN.test(key) || /password|secret|token/i.test(key) ? '[REDACTED]' : redact(item)]));
  return value;
}

export function safeError(error) { return redact(error instanceof Error ? error.message : String(error)); }
