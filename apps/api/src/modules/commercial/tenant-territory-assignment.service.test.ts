import { describe, expect, it, vi } from 'vitest';
import { TenantTerritoryAssignmentService } from './tenant-territory-assignment.service.js';

const tenant = { id: 1n, publicId: 'tenant-id', businessUnits: [{ city: 'São Paulo', state: 'SP' }] };
const match = { ibgeCode: '3550308', city: 'São Paulo', region: { publicId: 'region-id', managerId: 2n, manager: { publicId: 'manager-id', active: true } } };
function repository(overrides: Record<string, unknown> = {}) { return { tenant: { findUnique: vi.fn().mockResolvedValue(tenant) }, tenantCommercialAssignment: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) }, commercialRegionCity: { findMany: vi.fn().mockResolvedValue([match]) }, auditLog: { create: vi.fn().mockResolvedValue({}) }, ...overrides } as any; }
describe('TenantTerritoryAssignmentService', () => {
  it('creates a manager-only assignment for a matching active territory', async () => { const db=repository(); const result=await new TenantTerritoryAssignmentService(db).assignTenantByTerritory(1n); expect(result).toMatchObject({assigned:true,managerPublicId:'manager-id'}); expect(db.tenantCommercialAssignment.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({managerId:2n,representativeId:null,sellerId:null})})); expect(db.auditLog.create).toHaveBeenCalled(); });
  it('never overwrites an existing assignment', async () => { const db=repository({tenantCommercialAssignment:{findUnique:vi.fn().mockResolvedValue({id:9n}),create:vi.fn()}}); await expect(new TenantTerritoryAssignmentService(db).assignTenantByTerritory(1n)).resolves.toEqual({assigned:false,reason:'ASSIGNMENT_EXISTS'}); expect(db.tenantCommercialAssignment.create).not.toHaveBeenCalled(); });
  it('does not choose an ambiguous city', async () => { const db=repository({commercialRegionCity:{findMany:vi.fn().mockResolvedValue([match,{...match,region:{...match.region,publicId:'other'}}])}}); await expect(new TenantTerritoryAssignmentService(db).assignTenantByTerritory(1n)).resolves.toEqual({assigned:false,reason:'AMBIGUOUS_REGION'}); });
});
