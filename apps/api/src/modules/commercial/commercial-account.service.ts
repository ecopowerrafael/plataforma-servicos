import { CommercialRole, Prisma } from '../../database-client/client.js';
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
    input: CreateAccountInput,
    creatorUserId: bigint,
  ) {
    return this.createAccount(
      {
        ...input,
        role: CommercialRole.MANAGER,
        parentId: undefined,
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
}
