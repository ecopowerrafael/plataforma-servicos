import { describe, it, expect } from 'vitest';
import { GeoapifyKeyCipher } from './geoapify-key-cipher.js';

describe('GeoapifyKeyCipher', () => {
  const testKey = '0'.repeat(64); // 64 hex chars = 32 bytes for AES-256

  it('should encrypt and decrypt string', () => {
    const cipher = new GeoapifyKeyCipher(testKey);
    const plaintext = 'test-api-key-12345';

    const encrypted = cipher.encrypt(plaintext);
    const decrypted = cipher.decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertexts for same plaintext (due to random IV)', () => {
    const cipher = new GeoapifyKeyCipher(testKey);
    const plaintext = 'test-api-key';

    const encrypted1 = cipher.encrypt(plaintext);
    const encrypted2 = cipher.encrypt(plaintext);

    // Ciphertexts should be different due to random IV
    expect(encrypted1).not.toBe(encrypted2);

    // But both should decrypt to same plaintext
    expect(cipher.decrypt(encrypted1)).toBe(plaintext);
    expect(cipher.decrypt(encrypted2)).toBe(plaintext);
  });

  it('should throw on invalid ciphertext format', () => {
    const cipher = new GeoapifyKeyCipher(testKey);

    expect(() => cipher.decrypt('invalid')).toThrow();
    expect(() => cipher.decrypt('part1.part2')).toThrow();
  });

  it('should handle long API keys', () => {
    const cipher = new GeoapifyKeyCipher(testKey);
    const longKey = 'a'.repeat(256);

    const encrypted = cipher.encrypt(longKey);
    const decrypted = cipher.decrypt(encrypted);

    expect(decrypted).toBe(longKey);
  });

  it('should handle empty string', () => {
    const cipher = new GeoapifyKeyCipher(testKey);
    const plaintext = '';

    const encrypted = cipher.encrypt(plaintext);
    const decrypted = cipher.decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
  });
});
