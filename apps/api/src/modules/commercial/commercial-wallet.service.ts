import type { PrismaClient } from '../../database-client/client.js';
import type { Prisma } from '../../database-client/client.js';

export class CommercialWalletService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Calculate available balance for a commercial account.
   * Balance = SUM(credits) - SUM(debits)
   */
  async getBalance(commercialAccountId: bigint): Promise<bigint> {
    const result = await this.prisma.$queryRaw<{ balance: bigint }[]>`
      SELECT COALESCE(SUM(amount_cents), 0) as balance
      FROM commercial_wallet_entries
      WHERE commercial_account_id = ${commercialAccountId}
    `;

    return result[0]?.balance ?? 0n;
  }

  /**
   * Get wallet entries with pagination
   */
  async getEntries(
    commercialAccountId: bigint,
    limit: number = 50,
    offset: number = 0,
  ) {
    const entries = await this.prisma.commercialWalletEntry.findMany({
      where: { commercialAccountId },
      include: {
        tenant: { select: { publicId: true, displayName: true } },
        subscription: { select: { publicId: true } },
        commission: { select: { publicId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await this.prisma.commercialWalletEntry.count({
      where: { commercialAccountId },
    });

    return { entries, total };
  }

  /**
   * Create wallet entry (internal use)
   */
  async createEntry(
    data: Prisma.CommercialWalletEntryCreateInput,
  ) {
    return this.prisma.commercialWalletEntry.create({ data });
  }

  /**
   * Create multiple wallet entries in a transaction
   */
  async createEntries(
    data: Prisma.CommercialWalletEntryCreateInput[],
  ) {
    return this.prisma.$transaction(
      data.map(d => this.prisma.commercialWalletEntry.create({ data: d })),
    );
  }

  /**
   * Get monthly stats
   */
  async getMonthlyStats(commercialAccountId: bigint, year: number, month: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const credits = await this.prisma.$queryRaw<{ amount: bigint }[]>`
      SELECT COALESCE(SUM(amount_cents), 0) as amount
      FROM commercial_wallet_entries
      WHERE commercial_account_id = ${commercialAccountId}
        AND amount_cents > 0
        AND created_at >= ${startDate}
        AND created_at <= ${endDate}
    `;

    const debits = await this.prisma.$queryRaw<{ amount: bigint }[]>`
      SELECT COALESCE(SUM(ABS(amount_cents)), 0) as amount
      FROM commercial_wallet_entries
      WHERE commercial_account_id = ${commercialAccountId}
        AND amount_cents < 0
        AND created_at >= ${startDate}
        AND created_at <= ${endDate}
    `;

    return {
      creditsAmountCents: credits[0]?.amount ?? 0n,
      debitsAmountCents: debits[0]?.amount ?? 0n,
      netAmountCents: (credits[0]?.amount ?? 0n) - (debits[0]?.amount ?? 0n),
    };
  }
}
