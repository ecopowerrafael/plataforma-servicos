import { describe, expect, it, vi } from 'vitest';

import { TenantService } from './tenant.service.js';

const current = {
  allowMultipleUnits: false,
  defaultAppointmentIntervalMinutes: 15,
  minimumAdvanceMinutes: 0,
  maximumAdvanceDays: 180,
  weekStartsOn: 'MONDAY' as const,
  dateFormat: 'DD/MM/YYYY' as const,
  timeFormat: '24H' as const,
  membershipSalesEnabled: true,
  allowSingleServiceSales: true,
};

describe('tenant settings sales flags', () => {
  it('merges a partial update without resetting the other flag', async () => {
    const repository = {
      findSettings: vi.fn().mockResolvedValue(current),
      updateSettings: vi.fn().mockImplementation(async (_tenantId, settings) => settings),
      countActiveBusinessUnits: vi.fn(),
    };
    const service = new TenantService(repository as never);

    const result = await service.updateSettings(1n, { membershipSalesEnabled: false });

    expect(result).toMatchObject({
      membershipSalesEnabled: false,
      allowSingleServiceSales: true,
    });
    expect(repository.updateSettings).toHaveBeenCalledWith(1n, {
      ...current,
      membershipSalesEnabled: false,
    });
  });
});
