import { describe, expect, it } from 'vitest';
import { SUBSCRIPTION_RECOVERY_ROUTES } from './tenant-context.plugin.js';

describe('rotas de regularização comercial', () => {
  it('mantém consulta, seleção, cobrança e Stripe acessíveis durante bloqueio', () => {
    expect([...SUBSCRIPTION_RECOVERY_ROUTES]).toEqual(expect.arrayContaining([
      '/tenant/subscription', '/tenant/subscription/select-plan', '/tenant/subscription/charges',
      '/tenant/billing/stripe/checkout', '/tenant/billing/stripe/portal', '/tenant/billing/stripe/cancel',
      '/tenant/subscription/changes/:publicId/cancel', '/tenant/subscription/cancel-scheduled-change',
    ]));
  });
});
