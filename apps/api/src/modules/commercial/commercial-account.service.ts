import { CommercialRole } from '../../database-client/client.js';
import { randomUUID } from 'crypto';

interface CreateAccountInput {
  userId: bigint;
  role: CommercialRole;
  parentId?: bigint;
  defaultCommissionBps?: number;
}

export class CommercialAccountService {
  constructor(private prisma: any) {}

  async createManager(
    input: Omit<CreateAccountInput, 'role' | 'parentId'>,
    creatorUserId: bigint,
  ) {
    return this.createAccount(
      {
        ...input,
        role: CommercialRole.MANAGER,
      },
      creatorUserId,
    );
  }

  async createRepresentative(
    input: CreateAccountInput,
    creatorUserId: bigint,
    managerScope?: { managerId: bigint },
  ) {
    const parentId = managerScope?.managerId || input.parentId;

    if (!parentId) {
      throw new Error('MANAGER_ID_REQUIRED');
    }

    const manager = await this.prisma.commercialAccount.findUnique({
      where: { id: parentId },
    });

    if (!manager || manager.role !== CommercialRole.MANAGER) {
      throw new Error('INVALID_PARENT_MANAGER');
    }

    return this.createAccount(
      {
        ...input,
        role: CommercialRole.REPRESENTATIVE,
        parentId,
      },
      creatorUserId,
    );
  }

  async createSeller(
    input: CreateAccountInput,
    creatorUserId: bigint,
    parentScope?: { managerId: bigint; representativeId?: bigint },
  ) {
    const parentId = input.parentId || parentScope?.representativeId || parentScope?.managerId;

    if (!parentId) {
      throw new Error('PARENT_ID_REQUIRED');
    }

    const parent = await this.prisma.commercialAccount.findUnique({
      where: { id: parentId },
    });

    if (!parent || (parent.role !== CommercialRole.MANAGER && parent.role !== CommercialRole.REPRESENTATIVE)) {
      throw new Error('INVALID_PARENT');
    }

    return this.createAccount(
      {
        ...input,
        role: CommercialRole.SELLER,
        parentId,
      },
      creatorUserId,
    );
  }

  async getCommercialAccountByUser(userId: bigint) {
    return this.prisma.commercialAccount.findFirst({
      where: { userId },
      include: { parent: true, user: true },
    });
  }

  async getCommercialHierarchy(accountId: bigint) {
    return this.prisma.commercialAccount.findUnique({
      where: { id: accountId },
      include: {
        parent: true,
        children: {
          include: { user: true },
        },
      },
    });
  }

  private async createAccount(
    input: CreateAccountInput,
    creatorUserId: bigint,
  ) {
    this.validateCommissionBps(input.defaultCommissionBps ?? 0);

    const existing = await this.prisma.commercialAccount.findFirst({
      where: { userId: input.userId },
    });

    if (existing) {
      throw new Error('USER_ALREADY_HAS_COMMERCIAL_ACCOUNT');
    }

    return this.prisma.commercialAccount.create({
      data: {
        publicId: randomUUID(),
        userId: input.userId,
        role: input.role,
        parentId: input.parentId,
        defaultCommissionBps: input.defaultCommissionBps ?? 0,
        createdByUserId: creatorUserId,
      },
      include: { user: true, parent: true },
    });
  }

  private validateCommissionBps(bps: number): void {
    if (bps < 0 || bps > 10000) {
      throw new Error('INVALID_COMMISSION_BPS');
    }
  }

  async deactivateAccount(accountId: bigint): Promise<void> {
    await this.prisma.commercialAccount.update({
      where: { id: accountId },
      data: { active: false },
    });
  }

  async activateAccount(accountId: bigint): Promise<void> {
    await this.prisma.commercialAccount.update({
      where: { id: accountId },
      data: { active: true },
    });
  }

  async updateCommission(accountId: bigint, bps: number): Promise<void> {
    this.validateCommissionBps(bps);
    await this.prisma.commercialAccount.update({
      where: { id: accountId },
      data: { defaultCommissionBps: bps },
    });
  }

  async getAccountByPublicId(publicId: string) {
    return this.prisma.commercialAccount.findUnique({
      where: { publicId },
      include: { user: true, parent: true, children: { include: { user: true } } },
    });
  }

  async listAllAccounts(filters?: { role?: string; active?: boolean; managerPublicId?: string }) {
    const where: any = {};

    if (filters?.role) {
      where.role = filters.role;
    }
    if (filters?.active !== undefined) {
      where.active = filters.active;
    }
    if (filters?.managerPublicId) {
      const manager = await this.prisma.commercialAccount.findUnique({
        where: { publicId: filters.managerPublicId },
      });
      if (manager) {
        where.OR = [
          { id: manager.id },
          { parentId: manager.id },
          { parent: { parentId: manager.id } },
        ];
      }
    }

    return this.prisma.commercialAccount.findMany({
      where,
      include: { user: true, parent: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateAccountStatus(accountId: bigint, active: boolean): Promise<void> {
    await this.prisma.commercialAccount.update({
      where: { id: accountId },
      data: { active },
    });
  }

  async getAccountStats(accountId: bigint) {
    const account = await this.prisma.commercialAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) return null;

    const [regionsCount, clientsCount, teamCount] = await Promise.all([
      this.prisma.commercialRegion.count({ where: { managerId: accountId } }),
      this.prisma.tenantCommercialAssignment.count({
        where: { managerId: accountId },
      }),
      this.prisma.commercialAccount.count({ where: { parentId: accountId } }),
    ]);

    return { regionsCount, clientsCount, teamCount };
  }
}
