import { randomUUID } from 'node:crypto';
import { type PrismaClient } from '../../database-client/client.js';

export interface BackfillResult {
  total: number;
  alreadyLinked: number;
  accountsCreated: number;
  existingUsersLinked: number;
  pendingEmail: number;
  authorizationRepaired: number;
  errors: number;
}

export class ProfessionalBackfillService {
  public constructor(private readonly client: PrismaClient) {}

  public async backfillProfessionalUsers(): Promise<BackfillResult> {
    const result: BackfillResult = {
      total: 0,
      alreadyLinked: 0,
      accountsCreated: 0,
      existingUsersLinked: 0,
      pendingEmail: 0,
      authorizationRepaired: 0,
      errors: 0,
    };

    const professionals = await this.client.professional.findMany({
      include: { user: true, tenant: { select: { id: true } } },
    });

    result.total = professionals.length;

    for (const prof of professionals) {
      try {
        if (prof.userId !== null) {
          result.alreadyLinked++;
          continue;
        }

        if (!prof.email) {
          result.pendingEmail++;
          continue;
        }

        const normalizedEmail = prof.email.toLowerCase().trim();
        const existingUser = await this.client.user.findUnique({
          where: { normalizedEmail },
          include: { memberships: { where: { tenantId: prof.tenantId } } },
        });

        if (existingUser) {
          if (existingUser.memberships.length === 0) {
            const roleId = await this.client.role.findFirst({
              where: { tenantId: prof.tenantId, code: 'PROFESSIONAL' },
              select: { id: true },
            });

            if (roleId) {
              await this.client.tenantMembership.create({
                data: {
                  publicId: randomUUID(),
                  tenantId: prof.tenantId,
                  userId: existingUser.id,
                  roleId: roleId.id,
                  status: 'ACTIVE',
                },
              });
              result.authorizationRepaired++;
            }
          }

          await this.client.professional.update({
            where: { id: prof.id },
            data: { userId: existingUser.id },
          });

          result.existingUsersLinked++;
        } else {
          const newUser = await this.client.user.create({
            data: {
              publicId: randomUUID(),
              email: prof.email,
              normalizedEmail,
              status: 'ACTIVE',
            },
          });

          const roleId = await this.client.role.findFirst({
            where: { tenantId: prof.tenantId, code: 'PROFESSIONAL' },
            select: { id: true },
          });

          if (roleId) {
            await this.client.tenantMembership.create({
              data: {
                publicId: randomUUID(),
                tenantId: prof.tenantId,
                userId: newUser.id,
                roleId: roleId.id,
                status: 'ACTIVE',
              },
            });
          }

          await this.client.professional.update({
            where: { id: prof.id },
            data: { userId: newUser.id },
          });

          result.accountsCreated++;
        }
      } catch (error) {
        result.errors++;
      }
    }

    return result;
  }
}
