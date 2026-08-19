import { describe, expect, it } from 'vitest';

import { EnvironmentValidationError, loadEnvironment } from '../src/config/environment.js';

const validEnvironment = {
  NODE_ENV: 'test',
  API_HOST: '127.0.0.1',
  API_PORT: '3000',
  DATABASE_URL: 'mysql://USER:PASSWORD@127.0.0.1:3306/plataforma_servicos',
  CORS_ORIGINS: 'http://localhost:5173',
  LOG_LEVEL: 'silent',
  OBSERVABILITY_SLOW_REQUEST_MS: 1_000,
};

function omit(source: Record<string, string>, key: string): Record<string, string> {
  return Object.fromEntries(Object.entries(source).filter(([entryKey]) => entryKey !== key));
}

describe('validação do ambiente', () => {
  it('aceita uma configuração completa', () => {
    const environment = loadEnvironment(validEnvironment);

    expect(environment.API_PORT).toBe(3000);
    expect(environment.CORS_ORIGINS).toEqual(['http://localhost:5173']);
  });

  it('usa o limite padrão para alertas de lentidão', () => {
    const environment = loadEnvironment(omit(validEnvironment, 'OBSERVABILITY_SLOW_REQUEST_MS'));

    expect(environment.OBSERVABILITY_SLOW_REQUEST_MS).toBe(1_000);
  });

  it('rejeita variáveis obrigatórias ausentes', () => {
    const incompleteEnvironment = Object.fromEntries(
      Object.entries(validEnvironment).filter(([key]) => key !== 'DATABASE_URL'),
    );

    expect(() => loadEnvironment(incompleteEnvironment)).toThrow(EnvironmentValidationError);
  });

  it('rejeita origem universal em produção', () => {
    expect(() =>
      loadEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        CORS_ORIGINS: '*',
      }),
    ).toThrow(EnvironmentValidationError);
  });

  it('exige HTTPS e cookie Secure em produção', () => {
    expect(() =>
      loadEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://app.empresa.test',
        APP_WEB_URL: 'http://app.empresa.test',
        AUTH_COOKIE_SECURE: 'false',
      }),
    ).toThrow(EnvironmentValidationError);

    expect(
      loadEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://app.empresa.test',
        APP_WEB_URL: 'https://app.empresa.test',
        AUTH_COOKIE_SECURE: 'true',
      }).AUTH_COOKIE_SECURE,
    ).toBe(true);
  });

  it('monta DATABASE_URL a partir das variáveis DB_* quando ausente', () => {
    const environment = loadEnvironment({
      ...omit(validEnvironment, 'DATABASE_URL'),
      DB_NAME: 'u1_agendei',
      DB_USER: 'u1_agendei',
      DB_PASSWORD: 'p@ss:w/ord',
    });

    // usuário/senha/nome do banco com URL-encoding; host/porta/limite com padrões.
    expect(environment.DATABASE_URL).toBe(
      'mysql://u1_agendei:p%40ss%3Aw%2Ford@127.0.0.1:3306/u1_agendei?connection_limit=5',
    );
  });

  it('mantém DATABASE_URL direta quando fornecida (tem prioridade sobre DB_*)', () => {
    const environment = loadEnvironment({
      ...validEnvironment,
      DB_NAME: 'ignorado',
      DB_USER: 'ignorado',
      DB_PASSWORD: 'ignorado',
    });

    expect(environment.DATABASE_URL).toBe(validEnvironment.DATABASE_URL);
  });

  it('reaproveita PORT como API_PORT quando API_PORT não é definido', () => {
    const environment = loadEnvironment({ ...omit(validEnvironment, 'API_PORT'), PORT: '8080' });

    expect(environment.API_PORT).toBe(8080);
  });

  it('exige DB_PASSWORD em produção quando monta a URL a partir de DB_*', () => {
    expect(() =>
      loadEnvironment({
        ...omit(validEnvironment, 'DATABASE_URL'),
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://app.empresa.test',
        APP_WEB_URL: 'https://app.empresa.test',
        AUTH_COOKIE_SECURE: 'true',
        DB_NAME: 'u1_agendei',
        DB_USER: 'u1_agendei',
        DB_PASSWORD: '',
      }),
    ).toThrow(EnvironmentValidationError);
  });
});
