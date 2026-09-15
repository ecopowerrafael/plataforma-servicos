import { readFileSync } from 'node:fs';

import { PlanLimitCatalog } from '@plataforma/shared';
import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(new URL(`../../../../web/src/${path}`, import.meta.url), 'utf8');

const subscription = read('components/tenants/TenantSubscriptionModule.tsx');
const options = read('components/tenants/PaymentOptionsModule.tsx');
const router = read('router.tsx');
const paymentMethods = read('components/tenants/PaymentMethodsModule.tsx');
const commissions = read('components/professionals/MyCommissionsModule.tsx');
const availability = read('components/professionals/MyAvailabilityModule.tsx');
const homePage = read('routes/HomePage.tsx');

/** Remove comentários de linha para checar apenas o que chega à tela. */
const visible = (source: string) =>
  source
    .slice(source.indexOf('export function'))
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n');

describe('Minha assinatura', () => {
  it('traduz todas as chaves do catálogo de limites do plano', () => {
    for (const key of Object.keys(PlanLimitCatalog))
      expect(subscription).toContain(`'${key}': '`);
  });

  it('não imprime chaves técnicas na tela', () => {
    // As chaves aparecem apenas como índice dos rótulos, nunca dentro do JSX.
    expect(visible(subscription)).not.toMatch(/\.enabled/u);
    expect(subscription).toContain('friendlyKey(limit.key)');
  });
});

describe('Central de cobrança', () => {
  it('é a única tela de configuração online', () => {
    // A tela antiga de gateway foi removida; a rota apenas redireciona.
    expect(router).toContain(
      `{ path: '/app/financeiro/gateway', element: <Navigate replace to="/app/financeiro/opcoes" /> }`,
    );
    expect(homePage).not.toContain('PaymentGatewayModule');
    expect(homePage).not.toContain("to: '/app/financeiro/gateway'");
  });

  it('escreve somente pelos endpoints de payment-options', () => {
    const endpoints = [...options.matchAll(/'\/tenant\/[^']+'/gu)].map((match) => match[0]);
    expect(new Set(endpoints)).toEqual(
      new Set([
        "'/tenant/payment-options'",
        "'/tenant/payment-options/pay-local'",
        "'/tenant/payment-options/pix-local'",
        "'/tenant/payment-options/mercado-pago'",
      ]),
    );
  });

  it('não expõe JSON, identificador técnico nem segredo salvo', () => {
    expect(options).not.toContain('textarea');
    expect(options).not.toContain('credentialsJson');
    // Nenhum identificador de provedor é digitado nem exibido ao usuário.
    expect(options).not.toMatch(/'pix-local'|'mercadopago'/u);
    expect(options).toContain('Manter o token salvo');
  });

  it('mantém segredos ocultos por padrão e permite revelar', () => {
    expect(options).toContain("revealed ? 'text' : 'password'");
  });
});

describe('Formas de pagamento', () => {
  it('não expõe a ordem técnica para o usuário', () => {
    expect(visible(paymentMethods)).not.toMatch(/ordem/iu);
    expect(paymentMethods).toContain('sortOrder: items.length');
  });
});

describe('Comissões', () => {
  it('apresenta as regras em tabela, sem frases repetitivas', () => {
    expect(commissions).not.toContain('comissão padrão:');
    expect(commissions).toContain('Comissão efetiva');
  });
});

describe('Disponibilidade', () => {
  it('mostra a jornada por dia da semana com estado aberto/fechado', () => {
    expect(availability).toContain("'Aberto'");
    expect(availability).toContain("'Fechado'");
    expect(availability).not.toContain('<ul>');
  });
});

describe('Sidebar', () => {
  it('mantém a identidade fora da área rolável', () => {
    const brand = homePage.indexOf('app-navigation-brand');
    const scroll = homePage.indexOf('app-navigation-scroll');
    expect(brand).toBeGreaterThan(0);
    expect(scroll).toBeGreaterThan(brand);
  });
});
