/**
 * Monta a connection string MySQL exigida pelo Prisma a partir de variáveis
 * separadas (`DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`/
 * `DB_CONNECTION_LIMIT`), fazendo URL-encoding de usuário, senha e nome do banco.
 *
 * Objetivo: em produção (ex.: Hostinger) o operador informa apenas as variáveis
 * `DB_*` e a aplicação/CLI constrói a `DATABASE_URL` internamente — não é preciso
 * configurar `DATABASE_URL` manualmente. Quando `DATABASE_URL` já está definida,
 * ela é respeitada (retrocompatibilidade com desenvolvimento/testes/CI).
 *
 * Sem dependências externas: é importado tanto pelo runtime da API quanto pelo
 * `prisma.config.ts` (carregado pela CLI do Prisma), então precisa permanecer
 * puro e multiplataforma (funciona em Linux, que é onde a Hostinger builda).
 *
 * A função nunca imprime a senha nem a URL montada — apenas as retorna.
 */
export interface DatabaseUrlParts {
  DATABASE_URL?: string | undefined;
  DB_HOST?: string | undefined;
  DB_PORT?: string | undefined;
  DB_NAME?: string | undefined;
  DB_USER?: string | undefined;
  DB_PASSWORD?: string | undefined;
  DB_CONNECTION_LIMIT?: string | undefined;
}

/**
 * Retorna a `DATABASE_URL` efetiva, ou `undefined` quando não há `DATABASE_URL`
 * direta nem `DB_NAME`/`DB_USER` suficientes para montá-la.
 */
export function buildDatabaseUrl(source: DatabaseUrlParts = process.env): string | undefined {
  const direct = source.DATABASE_URL?.trim();
  if (direct !== undefined && direct.length > 0) {
    return direct;
  }

  const name = source.DB_NAME?.trim();
  const user = source.DB_USER?.trim();
  if (name === undefined || name.length === 0 || user === undefined || user.length === 0) {
    return undefined;
  }

  const host = source.DB_HOST?.trim();
  const port = source.DB_PORT?.trim();
  const limit = source.DB_CONNECTION_LIMIT?.trim();
  const password = source.DB_PASSWORD ?? '';

  const resolvedHost = host === undefined || host.length === 0 ? '127.0.0.1' : host;
  const resolvedPort = port === undefined || port.length === 0 ? '3306' : port;
  const resolvedLimit = limit === undefined || limit.length === 0 ? '5' : limit;

  const credentials = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`;
  const database = encodeURIComponent(name);
  const query = `connection_limit=${encodeURIComponent(resolvedLimit)}`;

  return `mysql://${credentials}@${resolvedHost}:${resolvedPort}/${database}?${query}`;
}
