import { randomBytes, randomUUID } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';

import { type TenantDomainRepository } from './tenant-domain.repository.js';
import { AppError } from '../../errors/AppError.js';

interface Actor {
  userId: bigint;
  sessionId: bigint;
}
type Repository = Pick<
  TenantDomainRepository,
  | 'tenant'
  | 'featureEnabled'
  | 'list'
  | 'find'
  | 'resolve'
  | 'create'
  | 'activate'
  | 'fail'
  | 'remove'
  | 'audit'
>;
export interface DomainVerifier {
  hasTxt(name: string, value: string): Promise<boolean>;
}
export class DnsDomainVerifier implements DomainVerifier {
  public async hasTxt(name: string, value: string): Promise<boolean> {
    try {
      return (await resolveTxt(name)).some((parts) => parts.join('') === value);
    } catch {
      return false;
    }
  }
}

const publicItem = (domain: {
  publicId: string;
  hostname: string;
  type: 'CUSTOM' | 'SUBDOMAIN';
  status: 'PENDING' | 'ACTIVE' | 'FAILED';
  verificationToken: string;
  verifiedAt: Date | null;
  lastError: string | null;
}) => ({
  publicId: domain.publicId,
  hostname: domain.hostname,
  type: domain.type,
  status: domain.status,
  verificationName: `_plataforma-verification.${domain.hostname}`,
  verificationValue: domain.verificationToken,
  verifiedAt: domain.verifiedAt?.toISOString() ?? null,
  lastError: domain.lastError,
});

export function isManagedSubdomain(hostname: string, baseDomain: string | null): boolean {
  return (
    baseDomain !== null &&
    hostname.endsWith(`.${baseDomain}`) &&
    !hostname.slice(0, -(baseDomain.length + 1)).includes('.')
  );
}
export class TenantDomainService {
  public constructor(
    private readonly repository: Repository,
    private readonly verifier: DomainVerifier,
    private readonly platformBaseDomain: string | null,
  ) {}
  public async list(tenantId: bigint) {
    return {
      items: (await this.repository.list(tenantId)).map(publicItem),
      platformBaseDomain: this.platformBaseDomain,
    };
  }
  public async create(
    tenantId: bigint,
    input: { hostname: string; type: 'CUSTOM' | 'SUBDOMAIN' },
    actor: Actor,
  ) {
    const tenant = await this.repository.tenant(tenantId);
    if (tenant === null)
      throw new AppError({
        code: 'TENANT_NOT_FOUND',
        message: 'Estabelecimento não encontrado.',
        statusCode: 404,
      });
    if (!(await this.repository.featureEnabled(tenantId)))
      throw new AppError({
        code: 'FEATURE_NOT_AVAILABLE',
        message: 'Domínio personalizado não está disponível no plano atual.',
        statusCode: 403,
      });
    const hostname = input.hostname.toLowerCase().replace(/\.$/u, '');
    const managedSubdomain = input.type === 'SUBDOMAIN';
    if (managedSubdomain && !isManagedSubdomain(hostname, this.platformBaseDomain))
      throw new AppError({
        code: 'SUBDOMAIN_INVALID',
        message: 'O subdomínio não pertence ao domínio base configurado.',
        statusCode: 400,
      });
    if (
      !managedSubdomain &&
      this.platformBaseDomain !== null &&
      (hostname === this.platformBaseDomain || hostname.endsWith(`.${this.platformBaseDomain}`))
    )
      throw new AppError({
        code: 'DOMAIN_INVALID',
        message: 'Use o tipo subdomínio para o domínio gerenciado da plataforma.',
        statusCode: 400,
      });
    const created = await this.repository.create({
      tenantId,
      hostname,
      type: input.type,
      verificationToken: randomBytes(32).toString('hex'),
      active: managedSubdomain,
    });
    if (created === null)
      throw new AppError({
        code: 'DOMAIN_ALREADY_IN_USE',
        message: 'Este domínio já está vinculado a outro estabelecimento.',
        statusCode: 409,
      });
    await this.audit(tenantId, actor, 'tenant_domain.created', created.publicId);
    return publicItem(created);
  }
  public async verify(tenantId: bigint, publicId: string, actor: Actor) {
    const domain = await this.repository.find(tenantId, publicId);
    if (domain === null)
      throw new AppError({
        code: 'DOMAIN_NOT_FOUND',
        message: 'Domínio não encontrado.',
        statusCode: 404,
      });
    if (domain.type === 'SUBDOMAIN' || domain.status === 'ACTIVE') return publicItem(domain);
    const valid = await this.verifier.hasTxt(
      `_plataforma-verification.${domain.hostname}`,
      domain.verificationToken,
    );
    const updated = valid
      ? await this.repository.activate(domain.id)
      : await this.repository.fail(domain.id, 'Registro TXT de verificação não encontrado.');
    await this.audit(
      tenantId,
      actor,
      valid ? 'tenant_domain.verified' : 'tenant_domain.verification_failed',
      domain.publicId,
    );
    return publicItem(updated);
  }
  public async remove(tenantId: bigint, publicId: string, actor: Actor): Promise<void> {
    const domain = await this.repository.find(tenantId, publicId);
    if (domain === null)
      throw new AppError({
        code: 'DOMAIN_NOT_FOUND',
        message: 'Domínio não encontrado.',
        statusCode: 404,
      });
    await this.repository.remove(domain.id);
    await this.audit(tenantId, actor, 'tenant_domain.removed', publicId);
  }
  public async resolve(hostname: string) {
    const domain = await this.repository.resolve(hostname.toLowerCase().replace(/\.$/u, ''));
    if (domain === null)
      throw new AppError({
        code: 'PUBLIC_SITE_NOT_FOUND',
        message: 'Página não encontrada.',
        statusCode: 404,
      });
    return { slug: domain.tenant.slug };
  }
  private async audit(tenantId: bigint, actor: Actor, action: string, targetPublicId: string) {
    await this.repository.audit({
      publicId: randomUUID(),
      tenantId,
      userId: actor.userId,
      sessionId: actor.sessionId,
      action,
      targetType: 'tenant_domain',
      targetPublicId,
    });
  }
}
