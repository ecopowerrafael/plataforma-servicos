import { CreateServiceRequestSchema, blockedServiceMinutes } from '@plataforma/shared';
import { describe, expect, it } from 'vitest';

import {
  inspectServiceImage,
  validateServiceImageUpload,
} from '../src/modules/services/service-image.storage.js';

const validService = {
  name: 'Consulta inicial',
  description: null,
  imageAlt: null,
  durationMinutes: 45,
  hasPostServiceBreak: false,
  postServiceBreakMinutes: 0,
  priceCents: 15000,
  color: '#2563EB',
  sortOrder: 0,
  active: true,
};

function png(width: number, height: number): Buffer {
  const image = Buffer.alloc(24);
  Buffer.from('\x89PNG\r\n\x1a\n', 'binary').copy(image);
  image.writeUInt32BE(13, 8);
  image.write('IHDR', 12, 'ascii');
  image.writeUInt32BE(width, 16);
  image.writeUInt32BE(height, 20);
  return image;
}

describe('cat\u00e1logo de servi\u00e7os', () => {
  it('aceita um servi\u00e7o sem pausa e calcula somente a dura\u00e7\u00e3o exibida', () => {
    expect(CreateServiceRequestSchema.safeParse(validService).success).toBe(true);
    expect(blockedServiceMinutes(45, false, 0)).toBe(45);
  });

  it('aceita pausa v\u00e1lida e calcula o bloqueio total sem persistir campo redundante', () => {
    expect(
      CreateServiceRequestSchema.safeParse({
        ...validService,
        hasPostServiceBreak: true,
        postServiceBreakMinutes: 15,
      }).success,
    ).toBe(true);
    expect(blockedServiceMinutes(45, true, 15)).toBe(60);
  });

  it.each([
    { hasPostServiceBreak: true, postServiceBreakMinutes: 0 },
    { hasPostServiceBreak: true, postServiceBreakMinutes: 241 },
    { hasPostServiceBreak: false, postServiceBreakMinutes: 1 },
    { durationMinutes: 0 },
    { priceCents: -1 },
    { color: 'blue' },
  ])('recusa regras inv\u00e1lidas de dura\u00e7\u00e3o, pre\u00e7o, cor ou pausa', (override) => {
    expect(CreateServiceRequestSchema.safeParse({ ...validService, ...override }).success).toBe(
      false,
    );
  });

  it('valida PNG pelos bytes, MIME e extens\u00e3o reais', () => {
    const image = png(32, 32);
    expect(inspectServiceImage(image)).toMatchObject({
      mimeType: 'image/png',
      width: 32,
      height: 32,
    });
    expect(() => {
      validateServiceImageUpload(image, 'imagem.png', 'image/png');
    }).not.toThrow();
    expect(() => {
      validateServiceImageUpload(image, 'imagem.jpg', 'image/jpeg');
    }).toThrow();
  });

  it('recusa formatos inexistentes, dimens\u00f5es inseguras e extens\u00e3o incompat\u00edvel', () => {
    expect(() => inspectServiceImage(Buffer.from('<svg/>'))).toThrow();
    expect(() => inspectServiceImage(png(31, 32))).toThrow();
    expect(() => {
      validateServiceImageUpload(png(32, 32), 'imagem.svg', 'image/png');
    }).toThrow();
  });
});
