import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
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

/** Tamanhos declarados no manifest do PWA — cada um servido como arquivo real. */
export const APP_ICON_SIZES = [192, 512] as const;
export type AppIconSize = (typeof APP_ICON_SIZES)[number];
export const APP_ICON_MIN_SIZE = 512;

export interface AppIconInspection {
  width: number;
  height: number;
  square: boolean;
  largeEnough: boolean;
  valid: boolean;
}

/** Medição sem sharp: `inspectServiceImage` lê o cabeçalho do arquivo. */
export function inspectAppIcon(image: Buffer): AppIconInspection {
  const { width, height } = inspectServiceImage(image);
  const square = width === height;
  const largeEnough = width >= APP_ICON_MIN_SIZE && height >= APP_ICON_MIN_SIZE;
  return { width, height, square, largeEnough, valid: square && largeEnough };
}

/**
 * Deriva o PNG quadrado do tamanho pedido a partir do APP_ICON original, que
 * permanece intacto no storage. O `sharp` é carregado sob demanda: ele nunca
 * pode entrar no caminho até o `listen`.
 */
export async function renderAppIcon(image: Buffer, size: AppIconSize): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  // `fit: 'contain'` nunca corta o ícone; a área extra fica transparente.
  return sharp(image)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export interface TenantMediaStorage {
  save(tenantPublicId: string, assetPublicId: string, image: Buffer): Promise<StoredServiceImage>;
  read(key: string): Promise<{ buffer: Buffer; mimeType: ServiceImageMimeType }>;
  remove(key: string): Promise<void>;
  /**
   * Derivado quadrado do ícone, gravado ao lado do original no mesmo storage.
   * A primeira requisição gera; as seguintes leem o arquivo já persistido.
   */
  appIconDerivative(key: string, size: AppIconSize, image: Buffer): Promise<Buffer>;
  /** Descarta os derivados de um asset (troca ou remoção do APP_ICON). */
  removeAppIconDerivatives(key: string): Promise<void>;
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

  /** Mesma convenção do thumbnail já existente: irmão do arquivo original. */
  private derivativePath(key: string, size: AppIconSize): string {
    return `${this.resolveKey(key)}.${String(size)}.png`;
  }

  public async appIconDerivative(
    key: string,
    size: AppIconSize,
    image: Buffer,
  ): Promise<Buffer> {
    const target = this.derivativePath(key, size);
    try {
      return await readFile(target);
    } catch {
      const rendered = await renderAppIcon(image, size);
      const temporary = `${target}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, rendered, { flag: 'wx' });
        await rename(temporary, target);
      } catch {
        // Sem permissão de escrita o ícone ainda é servido, só sem cache.
        await rm(temporary, { force: true });
      }
      return rendered;
    }
  }

  public async removeAppIconDerivatives(key: string): Promise<void> {
    await Promise.all(
      APP_ICON_SIZES.map((size) => rm(this.derivativePath(key, size), { force: true })),
    );
  }
}
