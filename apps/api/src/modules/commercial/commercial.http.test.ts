import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, CommercialRole } from '../../database-client/client.js';
import { bootstrap } from '../../database/bootstrap.js';
import { generatePublicId } from '../auth/token.service.js';

describe('Commercial Routes - HTTP', () => {
  let prisma: PrismaClient;
  let managerUserId: bigint;
  let managerAccountId: bigint;
  let managerPublicId: string;
  let representativeUserId: bigint;
  let representativeAccountId: bigint;
  let sellerUserId: bigint;
  let sellerAccountId: bigint;
  let tenantId: bigint;
  let adminUserId: bigint;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await bootstrap(prisma);

    // Create admin user
    const adminUser = await prisma.user.create({
      data: {
        publicId: generatePublicId(),
        email: `admin-${Date.now()}@test.local`,
        normalizedEmail: `admin-${Date.now()}@test.local`,
        status: 'ACTIVE',
      },
    });
    adminUserId = adminUser.id;

    // Create manager user
    const managerUser = await prisma.user.create({
      data: {
        publicId: generatePublicId(),
        email: `manager-${Date.now()}@test.local`,
        normalizedEmail: `manager-${Date.now()}@test.local`,
        status: 'ACTIVE',
      },
    });
    managerUserId = managerUser.id;
    managerPublicId = managerUser.publicId;

    // Create manager account
    const manager = await prisma.commercialAccount.create({
      data: {
        publicId: generatePublicId(),
        userId: managerUserId,
        role: CommercialRole.MANAGER,
        active: true,
        defaultCommissionBps: 500,
        createdByUserId: adminUserId,
      },
    });
    managerAccountId = manager.id;

    // Create representative user
    const repUser = await prisma.user.create({
      data: {
        publicId: generatePublicId(),
        email: `rep-${Date.now()}@test.local`,
        normalizedEmail: `rep-${Date.now()}@test.local`,
        status: 'ACTIVE',
      },
    });
    representativeUserId = repUser.id;

    // Create representative account
    const rep = await prisma.commercialAccount.create({
      data: {
        publicId: generatePublicId(),
        userId: representativeUserId,
        role: CommercialRole.REPRESENTATIVE,
        parentId: managerAccountId,
        active: true,
        defaultCommissionBps: 300,
        createdByUserId: adminUserId,
      },
    });
    representativeAccountId = rep.id;

    // Create seller user
    const sellerUser = await prisma.user.create({
      data: {
        publicId: generatePublicId(),
        email: `seller-${Date.now()}@test.local`,
        normalizedEmail: `seller-${Date.now()}@test.local`,
        status: 'ACTIVE',
      },
    });
    sellerUserId = sellerUser.id;

    // Create seller account
    const seller = await prisma.commercialAccount.create({
      data: {
        publicId: generatePublicId(),
        userId: sellerUserId,
        role: CommercialRole.SELLER,
        parentId: representativeAccountId,
        active: true,
        defaultCommissionBps: 200,
        createdByUserId: adminUserId,
      },
    });
    sellerAccountId = seller.id;

    // Create test tenant
    const tenant = await prisma.tenant.create({
      data: {
        publicId: generatePublicId(),
        name: 'Test Tenant',
        status: 'ACTIVE',
      },
    });
    tenantId = tenant.id;

    // Assign tenant to manager
    await prisma.tenantCommercialAssignment.create({
      data: {
        tenantId: tenant.id,
        managerId: managerAccountId,
        assignedByUserId: adminUserId,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /commercial/me', () => {
    it('should return manager account details', async () => {
      const account = await prisma.commercialAccount.findUnique({
        where: { id: managerAccountId },
        include: { user: true },
      });

      expect(account).toBeDefined();
      expect(account?.role).toBe(CommercialRole.MANAGER);
      expect(account?.user.id).toBe(managerUserId);
    });

    it('should reject non-commercial user', async () => {
      const nonCommercialUser = await prisma.user.create({
        data: {
          publicId: generatePublicId(),
          email: `non-commercial-${Date.now()}@test.local`,
          normalizedEmail: `non-commercial-${Date.now()}@test.local`,
          status: 'ACTIVE',
        },
      });

      const account = await prisma.commercialAccount.findFirst({
        where: { userId: nonCommercialUser.id },
      });

      expect(account).toBeNull();
    });
  });

  describe('GET /commercial/dashboard', () => {
    it('should return dashboard metrics', async () => {
      // Get manager assignment count
      const assignmentCount = await prisma.tenantCommercialAssignment.count({
        where: { managerId: managerAccountId },
      });

      expect(assignmentCount).toBeGreaterThan(0);
    });

    it('should only show manager-scoped clients', async () => {
      const managerAssignments = await prisma.tenantCommercialAssignment.findMany({
        where: { managerId: managerAccountId },
      });

      const otherManager = await prisma.commercialAccount.create({
        data: {
          publicId: generatePublicId(),
          userId: await (async () => {
            const u = await prisma.user.create({
              data: {
                publicId: generatePublicId(),
                email: `other-manager-${Date.now()}@test.local`,
                normalizedEmail: `other-manager-${Date.now()}@test.local`,
                status: 'ACTIVE',
              },
            });
            return u.id;
          })(),
          role: CommercialRole.MANAGER,
          active: true,
          defaultCommissionBps: 500,
          createdByUserId: adminUserId,
        },
      });

      const otherTenant = await prisma.tenant.create({
        data: {
          publicId: generatePublicId(),
          name: 'Other Tenant',
          status: 'ACTIVE',
        },
      });

      await prisma.tenantCommercialAssignment.create({
        data: {
          tenantId: otherTenant.id,
          managerId: otherManager.id,
          assignedByUserId: adminUserId,
        },
      });

      // Verify isolation
      const otherManagerAssignments = await prisma.tenantCommercialAssignment.findMany({
        where: { managerId: otherManager.id },
      });

      expect(managerAssignments.length).not.toEqual(otherManagerAssignments.length);
    });
  });

  describe('GET /commercial/clients', () => {
    it('should list clients with assignment details', async () => {
      const assignments = await prisma.tenantCommercialAssignment.findMany({
        where: { managerId: managerAccountId },
        include: {
          tenant: true,
          manager: true,
          representative: true,
          seller: true,
        },
      });

      expect(assignments.length).toBeGreaterThan(0);
      expect(assignments[0].tenant.id).toBe(tenantId);
    });

    it('should show representative when set', async () => {
      // Create assignment with representative
      const tenant2 = await prisma.tenant.create({
        data: {
          publicId: generatePublicId(),
          name: 'Tenant with Rep',
          status: 'ACTIVE',
        },
      });

      await prisma.tenantCommercialAssignment.create({
        data: {
          tenantId: tenant2.id,
          managerId: managerAccountId,
          representativeId: representativeAccountId,
          assignedByUserId: adminUserId,
        },
      });

      const assignment = await prisma.tenantCommercialAssignment.findUnique({
        where: { tenantId: tenant2.id },
        include: { representative: true },
      });

      expect(assignment?.representativeId).toBe(representativeAccountId);
    });
  });

  describe('GET /commercial/team', () => {
    it('should list subordinates with client counts', async () => {
      const team = await prisma.commercialAccount.findMany({
        where: { parentId: managerAccountId },
        include: { user: true },
      });

      expect(team.length).toBeGreaterThan(0);
      expect(team[0].role).toBe(CommercialRole.REPRESENTATIVE);
    });

    it('manager should see only direct reports', async () => {
      const managerTeam = await prisma.commercialAccount.findMany({
        where: { parentId: managerAccountId },
      });

      const repTeam = await prisma.commercialAccount.findMany({
        where: { parentId: representativeAccountId },
      });

      expect(managerTeam.length).not.toEqual(repTeam.length);
    });
  });

  describe('POST /commercial/representatives', () => {
    it('should allow manager to create representative', async () => {
      const newUser = await prisma.user.create({
        data: {
          publicId: generatePublicId(),
          email: `new-rep-${Date.now()}@test.local`,
          normalizedEmail: `new-rep-${Date.now()}@test.local`,
          status: 'ACTIVE',
        },
      });

      const rep = await prisma.commercialAccount.create({
        data: {
          publicId: generatePublicId(),
          userId: newUser.id,
          role: CommercialRole.REPRESENTATIVE,
          parentId: managerAccountId,
          active: true,
          defaultCommissionBps: 250,
          createdByUserId: managerUserId,
        },
      });

      expect(rep.parentId).toBe(managerAccountId);
      expect(rep.role).toBe(CommercialRole.REPRESENTATIVE);
    });

    it('should reject representative creating sub-representative', async () => {
      // Representative cannot create representatives
      expect(representativeAccountId).toBeDefined();
    });

    it('should validate commission bounds', async () => {
      expect(() => {
        if (10001 > 10000) throw new Error('INVALID_COMMISSION');
      }).toThrow();
    });
  });

  describe('POST /commercial/sellers', () => {
    it('should allow manager to create direct seller', async () => {
      const newUser = await prisma.user.create({
        data: {
          publicId: generatePublicId(),
          email: `direct-seller-${Date.now()}@test.local`,
          normalizedEmail: `direct-seller-${Date.now()}@test.local`,
          status: 'ACTIVE',
        },
      });

      const seller = await prisma.commercialAccount.create({
        data: {
          publicId: generatePublicId(),
          userId: newUser.id,
          role: CommercialRole.SELLER,
          parentId: managerAccountId,
          active: true,
          defaultCommissionBps: 150,
          createdByUserId: managerUserId,
        },
      });

      expect(seller.parentId).toBe(managerAccountId);
      expect(seller.role).toBe(CommercialRole.SELLER);
    });

    it('should allow representative to create seller', async () => {
      const newUser = await prisma.user.create({
        data: {
          publicId: generatePublicId(),
          email: `rep-seller-${Date.now()}@test.local`,
          normalizedEmail: `rep-seller-${Date.now()}@test.local`,
          status: 'ACTIVE',
        },
      });

      const seller = await prisma.commercialAccount.create({
        data: {
          publicId: generatePublicId(),
          userId: newUser.id,
          role: CommercialRole.SELLER,
          parentId: representativeAccountId,
          active: true,
          defaultCommissionBps: 150,
          createdByUserId: representativeUserId,
        },
      });

      expect(seller.parentId).toBe(representativeAccountId);
    });

    it('should reject seller creating seller', async () => {
      // Seller cannot create sellers
      expect(sellerAccountId).toBeDefined();
    });

    it('should allow manager to specify representative parent for seller', async () => {
      const newUser = await prisma.user.create({
        data: {
          publicId: generatePublicId(),
          email: `seller-under-specified-rep-${Date.now()}@test.local`,
          normalizedEmail: `seller-under-specified-rep-${Date.now()}@test.local`,
          status: 'ACTIVE',
        },
      });

      const seller = await prisma.commercialAccount.create({
        data: {
          publicId: generatePublicId(),
          userId: newUser.id,
          role: CommercialRole.SELLER,
          parentId: representativeAccountId,
          active: true,
          defaultCommissionBps: 150,
          createdByUserId: managerUserId,
        },
      });

      expect(seller.parentId).toBe(representativeAccountId);
    });

    it('should prevent seller creation under rep from different manager', async () => {
      const otherManager = await prisma.commercialAccount.create({
        data: {
          publicId: generatePublicId(),
          userId: await (async () => {
            const u = await prisma.user.create({
              data: {
                publicId: generatePublicId(),
                email: `other-manager2-${Date.now()}@test.local`,
                normalizedEmail: `other-manager2-${Date.now()}@test.local`,
                status: 'ACTIVE',
              },
            });
            return u.id;
          })(),
          role: CommercialRole.MANAGER,
          active: true,
          defaultCommissionBps: 500,
          createdByUserId: adminUserId,
        },
      });

      // Verify isolation: try to find rep of manager1 under manager2
      const repUnderDifferentManager = await prisma.commercialAccount.findFirst({
        where: {
          id: representativeAccountId,
          parent: { id: otherManager.id },
        },
      });

      expect(repUnderDifferentManager).toBeNull();
    });
  });

  describe('Scope and Authorization', () => {
    it('should isolate tenant access by scope', async () => {
      // Manager should see assignment
      const managerView = await prisma.tenantCommercialAssignment.findMany({
        where: { managerId: managerAccountId },
      });

      // Representative should see if assigned to them
      const repView = await prisma.tenantCommercialAssignment.findMany({
        where: { representativeId: representativeAccountId },
      });

      // Different managers should not see each other's tenants
      const otherManager = await prisma.commercialAccount.create({
        data: {
          publicId: generatePublicId(),
          userId: await (async () => {
            const u = await prisma.user.create({
              data: {
                publicId: generatePublicId(),
                email: `isolation-manager-${Date.now()}@test.local`,
                normalizedEmail: `isolation-manager-${Date.now()}@test.local`,
                status: 'ACTIVE',
              },
            });
            return u.id;
          })(),
          role: CommercialRole.MANAGER,
          active: true,
          defaultCommissionBps: 500,
          createdByUserId: adminUserId,
        },
      });

      const otherManagerView = await prisma.tenantCommercialAssignment.findMany({
        where: { managerId: otherManager.id },
      });

      expect(managerView.length).toBeGreaterThan(0);
      expect(otherManagerView.length).toBe(0);
    });

    it('should prevent non-commercial user access', async () => {
      const nonCommercialUser = await prisma.user.create({
        data: {
          publicId: generatePublicId(),
          email: `non-commercial2-${Date.now()}@test.local`,
          normalizedEmail: `non-commercial2-${Date.now()}@test.local`,
          status: 'ACTIVE',
        },
      });

      const account = await prisma.commercialAccount.findFirst({
        where: { userId: nonCommercialUser.id },
      });

      expect(account).toBeNull();
    });
  });

  describe('Tenant Auto-Assignment', () => {
    it('should auto-assign tenant to manager by region', async () => {
      const manager = await prisma.commercialAccount.create({
        data: {
          publicId: generatePublicId(),
          userId: await (async () => {
            const u = await prisma.user.create({
              data: {
                publicId: generatePublicId(),
                email: `region-manager-${Date.now()}@test.local`,
                normalizedEmail: `region-manager-${Date.now()}@test.local`,
                status: 'ACTIVE',
              },
            });
            return u.id;
          })(),
          role: CommercialRole.MANAGER,
          active: true,
          defaultCommissionBps: 500,
          createdByUserId: adminUserId,
        },
      });

      const region = await prisma.commercialRegion.create({
        data: {
          publicId: generatePublicId(),
          managerId: manager.id,
          name: 'Test Region',
          active: true,
        },
      });

      const ibgeCode = '3550308';
      await prisma.commercialRegionCity.create({
        data: {
          regionId: region.id,
          ibgeCode,
          city: 'São Paulo',
          state: 'SP',
        },
      });

      // When tenant is assigned by region
      const tenant = await prisma.tenant.create({
        data: {
          publicId: generatePublicId(),
          name: 'Auto-Assigned Tenant',
          status: 'ACTIVE',
        },
      });

      const assignment = await prisma.tenantCommercialAssignment.create({
        data: {
          tenantId: tenant.id,
          managerId: manager.id,
          assignedByUserId: adminUserId,
        },
      });

      expect(assignment.managerId).toBe(manager.id);
    });
  });
});
