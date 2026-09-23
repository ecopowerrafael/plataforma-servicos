import { describe, expect, it, vi } from 'vitest';

import { persistLayoutAndAdvance } from './onboarding-flow.js';

describe('onboarding layout flow', () => {
  it('persists the layout before advancing to colors', async () => {
    const order: string[] = [];
    const persistTheme = vi.fn((theme: string) => { order.push(`theme:${theme}`); return Promise.resolve(); });
    const advance = vi.fn((step: 'COLORS') => { order.push(`step:${step}`); return Promise.resolve(); });

    await persistLayoutAndAdvance({ theme: 'MODERN', persistTheme, advance });

    expect(order).toEqual(['theme:MODERN', 'step:COLORS']);
  });

  it('does not advance when layout persistence fails', async () => {
    const advance = vi.fn(() => Promise.resolve());
    await expect(persistLayoutAndAdvance({
      theme: 'CLASSIC',
      persistTheme: () => Promise.reject(new Error('Falha ao salvar layout.')),
      advance,
    })).rejects.toThrow('Falha ao salvar layout.');
    expect(advance).not.toHaveBeenCalled();
  });
});
