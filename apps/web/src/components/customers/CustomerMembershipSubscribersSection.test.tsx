// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { httpClient } from '../../lib/http.js';
import { CustomerMembershipSubscribersSection } from './CustomerMembershipSubscribersSection.js';

vi.mock('../../lib/http.js', () => ({
  httpClient: { request: vi.fn() },
}));

function renderSection(canManage: boolean) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <CustomerMembershipSubscribersSection
          tenantPublicId="00000000-0000-4000-8000-000000000010"
          plans={{ data: { items: [] } }}
          canManage={canManage}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('CustomerMembershipSubscribersSection', () => {
  afterEach(() => cleanup());

  it('keeps the historical list available but blocks new sales when the gate is off', async () => {
    vi.mocked(httpClient.request).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 20, total: 0, pages: 0 },
    });
    renderSection(false);

    const button = await screen.findByRole('button', { name: '+ Novo assinante' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute('title')).toBe('A venda de mensalidades está desativada.');
    expect(await screen.findByText('Nenhum assinante encontrado')).not.toBeNull();
  });

  it('opens the new subscriber drawer when management is available', async () => {
    vi.mocked(httpClient.request).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 20, total: 0, pages: 0 },
    });
    renderSection(true);

    const button = await screen.findByRole('button', { name: '+ Novo assinante' });
    button.click();

    expect(await screen.findByRole('dialog', { name: 'Novo assinante' })).not.toBeNull();
  });
});
