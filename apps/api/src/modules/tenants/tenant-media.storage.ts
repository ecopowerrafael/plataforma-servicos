import { join } from 'node:path';

import {
  LocalServiceImageStorage,
  type ServiceImageMimeType,
  type StoredServiceImage,
} from '../services/service-image.storage.js';

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
    super(process.env.TENANT_MEDIA_STORAGE_DIR ?? join(process.cwd(), 'uploads', 'tenant-media'));
  }
}
