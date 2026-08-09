import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Criptografa/descriptografa as credenciais de gateway em repouso (AES-256-GCM).
 * Sem a chave configurada (PAYMENT_GATEWAY_ENCRYPTION_KEY), a operação falha
 * explicitamente — nunca grava credenciais em texto plano nem finge sucesso.
 */
export class CredentialsCipher {
  private readonly key: Buffer;

  public constructor(hexKey: string) {
    this.key = Buffer.from(hexKey, 'hex');
  }

  public encrypt(plaintext: Record<string, unknown>): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(plaintext), 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(
      '.',
    );
  }

  public decrypt(payload: string): Record<string, unknown> {
    const [ivBase64, authTagBase64, ciphertextBase64] = payload.split('.');
    if (ivBase64 === undefined || authTagBase64 === undefined || ciphertextBase64 === undefined)
      throw new Error('Formato de credenciais criptografadas inválido.');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivBase64, 'base64'));
    decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextBase64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(plaintext) as Record<string, unknown>;
  }
}
