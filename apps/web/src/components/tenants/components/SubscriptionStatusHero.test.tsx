// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SubscriptionStatusHero } from './SubscriptionStatusHero.js';

const plan = { name: 'Plano Essencial' };
const baseSubscription = {
  status: 'ACTIVE',
  priceCents: '4900',
  currency: 'BRL',
  billingCycle: 'MONTHLY',
  currentPeriodEndsAt: '2026-11-01T00:00:00.000Z',
};
const commercial = { state: 'ACTIVE', trialDaysRemaining: null };

afterEach(cleanup);

describe('SubscriptionStatusHero', () => {
  it.each([
    ['SUSPENDED', 'SUSPENDED', 'Assinatura suspensa', 'Regularizar acesso'],
    ['EXPIRED', 'EXPIRED', 'Assinatura expirada', 'Renovar assinatura'],
    ['CANCELED', 'CANCELED', 'Assinatura cancelada', 'Reativar assinatura'],
  ])('uses specific copy for %s', (subscriptionStatus, commercialState, label, action) => {
    render(
      <SubscriptionStatusHero
        plan={plan}
        subscription={{ ...baseSubscription, status: subscriptionStatus }}
        commercial={{ ...commercial, state: commercialState }}
        onPay={vi.fn()}
      />,
    );

    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(action, 'u') })).toBeTruthy();
    expect(screen.queryByText('Precisa de atenção')).toBeNull();
  });

  it('uses the resolved commercial state when an ACTIVE record is expired', () => {
    render(
      <SubscriptionStatusHero
        plan={plan}
        subscription={{ ...baseSubscription, status: 'ACTIVE' }}
        commercial={{ ...commercial, state: 'EXPIRED' }}
        onPay={vi.fn()}
      />,
    );

    expect(screen.getByText('Assinatura expirada')).toBeTruthy();
    expect(screen.queryAllByText('Ativa')).toHaveLength(0);
  });
});
