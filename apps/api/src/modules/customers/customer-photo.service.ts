import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { type ServiceImageStorage } from '../services/service-image.storage.js';

/**
 * Foto do cliente do site público. Reutiliza o storage e a validação de imagem
 * já usados por serviços/profissionais; o arquivo fica isolado por tenant e por
 * cliente na chave gerada pelo storage.
 */
export class CustomerPhotoService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly images: ServiceImageStorage,
  ) {}

  private async find(tenantId: bigint, customerId: bigint) {
    const customer = await this.client.customer.findFirst({
      where: { id: customerId, tenantId },
      select: {
        id: true,
        publicId: true,
        name: true,
        email: true,
        phone: true,
        photoPath: true,
        updatedAt: true,
        tenant: { select: { publicId: true } },
      },
    });
    if (customer === null)
      throw new AppError({
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Cliente não encontrado.',
        statusCode: 404,
      });
    return customer;
  }

  public async replace(tenantId: bigint, customerId: bigint, image: Buffer) {
    const customer = await this.find(tenantId, customerId);
    const stored = await this.images.save(customer.tenant.publicId, customer.publicId, image);
    try {
      const updated = await this.client.customer.update({
        where: { id: customer.id },
        data: { photoPath: stored.key },
        select: {
          publicId: true,
          name: true,
          email: true,
          phone: true,
          photoPath: true,
          updatedAt: true,
        },
      });
      if (customer.photoPath !== null) await this.images.remove(customer.photoPath);
      return updated;
    } catch (error) {
      await this.images.remove(stored.key);
      throw error;
    }
  }

  public async remove(tenantId: bigint, customerId: bigint) {
    const customer = await this.find(tenantId, customerId);
    if (customer.photoPath === null) return customer;
    const updated = await this.client.customer.update({
      where: { id: customer.id },
      data: { photoPath: null },
      select: {
        publicId: true,
        name: true,
        email: true,
        phone: true,
        photoPath: true,
        updatedAt: true,
      },
    });
    await this.images.remove(customer.photoPath);
    return updated;
  }

  public async read(tenantId: bigint, customerId: bigint) {
    const customer = await this.find(tenantId, customerId);
    if (customer.photoPath === null)
      throw new AppError({
        code: 'CUSTOMER_PHOTO_NOT_FOUND',
        message: 'Foto não encontrada.',
        statusCode: 404,
      });
    return this.images.read(customer.photoPath, 'thumbnail');
  }
}
