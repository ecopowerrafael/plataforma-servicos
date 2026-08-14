import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve, sep } from 'node:path';

import { AppError } from '../../errors/AppError.js';

export type ServiceImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

interface DetectedImage {
  mimeType: ServiceImageMimeType;
  extension: 'jpg' | 'png' | 'webp' | 'gif';
  width: number;
  height: number;
}

export interface StoredServiceImage {
  key: string;
  mimeType: ServiceImageMimeType;
}

export interface ServiceImageStorage {
  save(tenantPublicId: string, servicePublicId: string, image: Buffer): Promise<StoredServiceImage>;
  read(
    key: string,
    variant?: 'original' | 'thumbnail',
  ): Promise<{ buffer: Buffer; mimeType: ServiceImageMimeType }>;
  remove(key: string): Promise<void>;
}

function imageError(code: string, message: string, statusCode = 400): AppError {
  return new AppError({ code, message, statusCode });
}

function uint16(buffer: Buffer, offset: number): number {
  return buffer.readUInt16BE(offset);
}

function uint24LittleEndian(buffer: Buffer, offset: number): number {
  return (
    buffer.readUInt8(offset) +
    (buffer.readUInt8(offset + 1) << 8) +
    (buffer.readUInt8(offset + 2) << 16)
  );
}

function uint32LittleEndian(buffer: Buffer, offset: number): number {
  return buffer.readUInt32LE(offset);
}

function jpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer.readUInt8(offset) !== 0xff) return null;
    const marker = buffer.readUInt8(offset + 1);
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > buffer.length) return null;
    const length = uint16(buffer, offset);
    if (length < 2 || offset + length > buffer.length) return null;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      if (length < 7) return null;
      return { height: uint16(buffer, offset + 3), width: uint16(buffer, offset + 5) };
    }
    offset += length;
  }
  return null;
}

function webpDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 30) return null;
  const chunk = buffer.subarray(12, 16).toString('ascii');
  if (chunk === 'VP8X' && buffer.length >= 30) {
    return {
      width: uint24LittleEndian(buffer, 24) + 1,
      height: uint24LittleEndian(buffer, 27) + 1,
    };
  }
  if (
    chunk === 'VP8 ' &&
    buffer.length >= 30 &&
    buffer[23] === 0x9d &&
    buffer[24] === 0x01 &&
    buffer[25] === 0x2a
  ) {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) {
    const bits = uint32LittleEndian(buffer, 21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

export function inspectServiceImage(buffer: Buffer): DetectedImage {
  let detected: DetectedImage | null = null;
  if (
    buffer.length >= 24 &&
    buffer.subarray(0, 8).equals(Buffer.from('\x89PNG\r\n\x1a\n', 'binary'))
  ) {
    detected = {
      mimeType: 'image/png',
      extension: 'png',
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  } else if (
    buffer.length >= 10 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    const dimensions = jpegDimensions(buffer);
    if (dimensions !== null) detected = { mimeType: 'image/jpeg', extension: 'jpg', ...dimensions };
  } else if (
    buffer.length >= 16 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    const dimensions = webpDimensions(buffer);
    if (dimensions !== null)
      detected = { mimeType: 'image/webp', extension: 'webp', ...dimensions };
  } else if (
    buffer.length >= 10 &&
    ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))
  ) {
    detected = {
      mimeType: 'image/gif',
      extension: 'gif',
      width: buffer.readUInt16LE(6),
      height: buffer.readUInt16LE(8),
    };
  }
  if (detected === null)
    throw imageError(
      'SERVICE_IMAGE_TYPE_INVALID',
      'N\u00e3o foi poss\u00edvel identificar o formato da imagem. Tente export\u00e1-la novamente como JPG ou PNG.',
    );
  const dimensions = configuredDimensions();
  if (
    detected.width < dimensions.min ||
    detected.height < dimensions.min ||
    detected.width > dimensions.max ||
    detected.height > dimensions.max
  ) {
    throw imageError(
      'SERVICE_IMAGE_DIMENSIONS_INVALID',
      'As dimens\u00f5es da imagem n\u00e3o s\u00e3o permitidas.',
    );
  }
  return detected;
}

export function serviceImageMaxBytes(): number {
  const value = Number(process.env.SERVICE_IMAGE_MAX_BYTES ?? 5 * 1024 * 1024);
  return Number.isSafeInteger(value) && value >= 32 * 1024 && value <= 20 * 1024 * 1024
    ? value
    : 5 * 1024 * 1024;
}

function configuredDimension(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function configuredDimensions(): { min: number; max: number } {
  const min = configuredDimension('SERVICE_IMAGE_MIN_DIMENSION', 32, 1, 4_096);
  const max = configuredDimension('SERVICE_IMAGE_MAX_DIMENSION', 4_096, min, 8_192);
  return { min, max };
}

function validateUpload(
  buffer: Buffer,
  originalName: string,
  declaredMimeType: string,
): DetectedImage {
  if (buffer.length === 0) {
    throw imageError(
      'SERVICE_IMAGE_TYPE_INVALID',
      'O arquivo enviado n\u00e3o \u00e9 uma imagem v\u00e1lida.',
    );
  }
  if (buffer.length > serviceImageMaxBytes()) {
    const maximumMegabytes = Math.floor(serviceImageMaxBytes() / (1024 * 1024));
    throw imageError(
      'SERVICE_IMAGE_SIZE_INVALID',
      `A imagem excede o limite permitido de ${String(maximumMegabytes)} MB.`,
    );
  }
  const extension = extname(basename(originalName)).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(extension)) {
    throw imageError('SERVICE_IMAGE_EXTENSION_INVALID', 'Use uma imagem JPG, JPEG, PNG ou WebP.');
  }
  const detected = inspectServiceImage(buffer);
  const allowedExtensions: Record<ServiceImageMimeType, readonly string[]> = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/webp': ['.webp'],
    'image/gif': ['.gif'],
  };
  if (!allowedExtensions[detected.mimeType].includes(extension)) {
    throw imageError(
      'SERVICE_IMAGE_MIME_MISMATCH',
      'A extens\u00e3o do arquivo n\u00e3o corresponde ao formato real da imagem.',
    );
  }
  void declaredMimeType;
  return detected;
}

export class LocalServiceImageStorage implements ServiceImageStorage {
  protected readonly root: string;

  public constructor(
    root = process.env.SERVICE_IMAGE_STORAGE_DIR ?? join(process.cwd(), 'uploads', 'services'),
    private readonly preset: 'service' | 'professional' | 'passthrough' = 'service',
  ) {
    this.root = resolve(root);
  }

  public async save(
    tenantPublicId: string,
    servicePublicId: string,
    image: Buffer,
  ): Promise<StoredServiceImage> {
    const detected = inspectServiceImage(image);
    const directory = resolve(this.root, tenantPublicId, servicePublicId);
    if (!directory.startsWith(`${this.root}${sep}`))
      throw imageError('SERVICE_IMAGE_PATH_INVALID', 'Local de armazenamento inv\u00e1lido.', 500);
    await mkdir(directory, { recursive: true });
    const filename = `${randomUUID()}.${this.preset === 'passthrough' ? detected.extension : 'webp'}`;
    const target = resolve(directory, filename);
    const temporary = resolve(directory, `.${randomUUID()}.tmp`);
    const normalized = await this.normalize(image, 'original');
    await writeFile(temporary, normalized, { flag: 'wx' });
    await rename(temporary, target);
    if (this.preset !== 'passthrough') {
      const thumbnail = await this.normalize(image, 'thumbnail');
      const thumbnailTarget = this.thumbnailPath(target);
      const thumbnailTemporary = resolve(directory, `.${randomUUID()}.thumb.tmp`);
      await writeFile(thumbnailTemporary, thumbnail, { flag: 'wx' });
      await rename(thumbnailTemporary, thumbnailTarget);
    }
    return {
      key: join(tenantPublicId, servicePublicId, filename).replaceAll('\\', '/'),
      mimeType: this.preset === 'passthrough' ? detected.mimeType : 'image/webp',
    };
  }

  public async read(
    key: string,
    variant: 'original' | 'thumbnail' = 'original',
  ): Promise<{ buffer: Buffer; mimeType: ServiceImageMimeType }> {
    const path = this.resolveKey(key);
    try {
      let buffer: Buffer;
      if (variant === 'thumbnail' && this.preset !== 'passthrough') {
        try {
          buffer = await readFile(this.thumbnailPath(path));
        } catch {
          buffer = await this.normalize(await readFile(path), 'thumbnail');
        }
      } else {
        buffer = await readFile(path);
      }
      return { buffer, mimeType: inspectServiceImage(buffer).mimeType };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw imageError(
        'SERVICE_IMAGE_NOT_FOUND',
        'Imagem do servi\u00e7o n\u00e3o encontrada.',
        404,
      );
    }
  }

  public async remove(key: string): Promise<void> {
    try {
      const path = this.resolveKey(key);
      await Promise.all([
        rm(path, { force: true }),
        ...(this.preset === 'passthrough' ? [] : [rm(this.thumbnailPath(path), { force: true })]),
      ]);
    } catch {
      // The persisted service record remains authoritative if filesystem cleanup fails.
    }
  }

  public validateUpload(buffer: Buffer, originalName: string, declaredMimeType: string): void {
    validateUpload(buffer, originalName, declaredMimeType);
  }

  protected resolveKey(key: string): string {
    const path = resolve(this.root, key);
    if (!path.startsWith(`${this.root}${sep}`))
      throw imageError('SERVICE_IMAGE_PATH_INVALID', 'Caminho da imagem inv\u00e1lido.', 400);
    return path;
  }

  private thumbnailPath(path: string): string {
    const extension = extname(path);
    return `${path.slice(0, -extension.length)}.thumb.webp`;
  }

  private async normalize(image: Buffer, variant: 'original' | 'thumbnail'): Promise<Buffer> {
    if (this.preset === 'passthrough') return image;
    // Import sob demanda: `sharp` é pesado e não pode entrar no caminho até o
    // `listen` (o ambiente da Hostinger derruba o processo se demorar).
    const sharp = (await import('sharp')).default;
    const square = this.preset === 'professional';
    const width = variant === 'thumbnail' ? (square ? 320 : 400) : square ? 800 : 1200;
    const height = variant === 'thumbnail' ? (square ? 320 : 300) : square ? 800 : 900;
    return sharp(image)
      .rotate()
      .resize(width, height, { fit: 'cover', position: 'attention' })
      .webp({ quality: variant === 'thumbnail' ? 78 : 86, effort: 4 })
      .toBuffer();
  }
}

export function validateServiceImageUpload(
  buffer: Buffer,
  originalName: string,
  declaredMimeType: string,
): void {
  validateUpload(buffer, originalName, declaredMimeType);
}
