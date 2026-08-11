import { join } from 'node:path';

import { AppError } from '../../errors/AppError.js';
import {
  inspectServiceImage,
  LocalServiceImageStorage,
  validateServiceImageUpload,
  type ServiceImageMimeType,
  type StoredServiceImage,
} from '../services/service-image.storage.js';

export function validateTenantMediaUpload(
  image: Buffer,
  originalName: string,
  declaredMimeType: string,
  kind: string,
): void {
  validateServiceImageUpload(image, originalName, declaredMimeType);
  if (kind !== 'APP_ICON' && kind !== 'FAVICON') return;
  const dimensions = inspectServiceImage(image);
  if (dimensions.width !== dimensions.height)
    throw new AppError({
      code: 'TENANT_MEDIA_ICON_MUST_BE_SQUARE',
      message: 'O ícone do aplicativo precisa ser uma imagem quadrada.',
      statusCode: 400,
    });
}

export interface TenantMediaStorage {
  save(tenantPublicId: string, assetPublicId: string, image: Buffer): Promise<StoredServiceImage>;
  read(key: string): Promise<{ buffer: Buffer; mimeType: ServiceImageMimeType }>;
  remove(key: string): Promise<void>;
}

export class LocalTenantMediaStorage
  extends LocalServiceImageStorage
  implements TenantMediaStorage
{
  public constructor() {
    super(
      process.env.TENANT_MEDIA_STORAGE_DIR ?? join(process.cwd(), 'uploads', 'tenant-media'),
      'passthrough',
    );
  }
}
