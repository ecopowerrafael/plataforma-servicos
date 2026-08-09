import { describe, expect, it } from 'vitest';

import { EnvironmentValidationError, loadEnvironment } from '../src/config/environment.js';

const validEnvironment = {
  NODE_ENV: 'test',
  API_HOST: '127.0.0.1',
  API_PORT: '3000',
  DATABASE_URL: 'mysql://USER:PASSWORD@127.0.0.1:3306/plataforma_servicos',
  CORS_ORIGINS: 'http://localhost:5173',
  LOG_LEVEL: 'silent',
};

describe('validação do ambiente', () => {
  it('aceita uma configuração completa', () => {
    const environment = loadEnvironment(validEnvironment);

    expect(environment.API_PORT).toBe(3000);
    expect(environment.CORS_ORIGINS).toEqual(['http://localhost:5173']);
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
});
