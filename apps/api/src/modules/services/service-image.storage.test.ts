import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';

import { LocalServiceImageStorage } from './service-image.storage.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('LocalServiceImageStorage', () => {
  it('normalizes service images and creates a real thumbnail', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'agendei-service-images-'));
    directories.push(directory);
    const source = await sharp({
      create: { width: 720, height: 1280, channels: 3, background: '#3157d5' },
    })
      .jpeg()
      .toBuffer();
    const storage = new LocalServiceImageStorage(directory, 'service');

    const stored = await storage.save('tenant-id', 'service-id', source);
    const original = await storage.read(stored.key);
    const thumbnail = await storage.read(stored.key, 'thumbnail');
    const originalMetadata = await sharp(original.buffer).metadata();
    const thumbnailMetadata = await sharp(thumbnail.buffer).metadata();

    expect(stored.mimeType).toBe('image/webp');
    expect(originalMetadata).toMatchObject({ width: 1200, height: 900, format: 'webp' });
    expect(thumbnailMetadata).toMatchObject({ width: 400, height: 300, format: 'webp' });
    expect(thumbnail.buffer.length).toBeLessThan(original.buffer.length);
  });

  it('uses a square crop for professional avatars', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'agendei-professional-images-'));
    directories.push(directory);
    const source = await sharp({
      create: { width: 1200, height: 700, channels: 3, background: '#111827' },
    })
      .png()
      .toBuffer();
    const storage = new LocalServiceImageStorage(directory, 'professional');

    const stored = await storage.save('tenant-id', 'professional-id', source);
    const thumbnail = await storage.read(stored.key, 'thumbnail');

    await expect(sharp(thumbnail.buffer).metadata()).resolves.toMatchObject({
      width: 320,
      height: 320,
      format: 'webp',
    });
  });
});
