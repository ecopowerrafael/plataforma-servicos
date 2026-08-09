import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve, sep } from 'node:path';

import { AppError } from '../../errors/AppError.js';

export type ServiceImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

interface DetectedImage {
  mimeType: ServiceImageMimeType;
  extension: 'jpg' | 'png' | 'webp';
  width: number;
  height: number;
}

export interface StoredServiceImage {
  key: string;
  mimeType: ServiceImageMimeType;
}

export interface ServiceImageStorage {
  save(tenantPublicId: string, servicePublicId: string, image: Buffer): Promise<StoredServiceImage>;
  read(key: string): Promise<{ buffer: Buffer; mimeType: ServiceImageMimeType }>;
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
  }
  if (detected === null)
    throw imageError(
      'SERVICE_IMAGE_TYPE_INVALID',
      'O arquivo enviado n\u00e3o \u00e9 uma imagem permitida.',
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
  if (buffer.length === 0 || buffer.length > serviceImageMaxBytes()) {
    throw imageError('SERVICE_IMAGE_SIZE_INVALID', 'O arquivo excede o tamanho permitido.');
  }
  const detected = inspectServiceImage(buffer);
  const extension = extname(basename(originalName)).toLowerCase();
  const allowedExtensions: Record<ServiceImageMimeType, readonly string[]> = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/webp': ['.webp'],
  };
  if (
    declaredMimeType !== detected.mimeType ||
    !allowedExtensions[detected.mimeType].includes(extension)
  ) {
    throw imageError(
      'SERVICE_IMAGE_MIME_MISMATCH',
      'O tipo declarado da imagem n\u00e3o corresponde ao arquivo enviado.',
    );
  }
  return detected;
}

export class LocalServiceImageStorage implements ServiceImageStorage {
  private readonly root: string;

  public constructor(
    root = process.env.SERVICE_IMAGE_STORAGE_DIR ?? join(process.cwd(), 'uploads', 'services'),
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
    const filename = `${randomUUID()}.${detected.extension}`;
    const target = resolve(directory, filename);
    const temporary = resolve(directory, `.${randomUUID()}.tmp`);
    await writeFile(temporary, image, { flag: 'wx' });
    await rename(temporary, target);
    return {
      key: join(tenantPublicId, servicePublicId, filename).replaceAll('\\', '/'),
      mimeType: detected.mimeType,
    };
  }

  public async read(key: string): Promise<{ buffer: Buffer; mimeType: ServiceImageMimeType }> {
    const path = this.resolveKey(key);
    try {
      const buffer = await readFile(path);
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
      await rm(this.resolveKey(key), { force: true });
    } catch {
      // The persisted service record remains authoritative if filesystem cleanup fails.
    }
  }

  public validateUpload(buffer: Buffer, originalName: string, declaredMimeType: string): void {
    validateUpload(buffer, originalName, declaredMimeType);
  }

  private resolveKey(key: string): string {
    const path = resolve(this.root, key);
    if (!path.startsWith(`${this.root}${sep}`))
      throw imageError('SERVICE_IMAGE_PATH_INVALID', 'Caminho da imagem inv\u00e1lido.', 400);
    return path;
  }
}

export function validateServiceImageUpload(
  buffer: Buffer,
  originalName: string,
  declaredMimeType: string,
): void {
  validateUpload(buffer, originalName, declaredMimeType);
}
