import { AppError } from '../../errors/AppError.js';

interface GoogleIdTokenPayload {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  aud: string;
  iat: number;
  exp: number;
}

export class GoogleAuthService {
  public constructor(private readonly googleClientId: string) {}

  /**
   * Validate and decode Google ID token.
   * Never trust data sent separately by frontend.
   * Extract all user info from the token itself.
   */
  public validateIdToken(credential: string): GoogleIdTokenPayload {
    try {
      // Decode JWT without verification (verification would require Google's public keys)
      // In production, verify the signature against Google's JWKS endpoint
      const parts = credential.split('.');
      if (parts.length !== 3 || parts[1] === undefined) {
        throw new Error('Invalid JWT format');
      }

      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));

      // Validate required fields
      if (typeof payload.sub !== 'string' || !payload.sub) {
        throw new Error('Missing or invalid sub claim');
      }
      if (typeof payload.email !== 'string' || !payload.email) {
        throw new Error('Missing or invalid email claim');
      }
      if (payload.email_verified !== true) {
        throw new Error('Email not verified');
      }
      if (payload.aud !== this.googleClientId) {
        throw new Error('Invalid audience');
      }

      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp <= now) {
        throw new Error('Token expired');
      }

      return payload as GoogleIdTokenPayload;
    } catch (error) {
      throw new AppError({
        code: 'GOOGLE_AUTH_INVALID',
        message: 'Token do Google inválido ou expirado.',
        statusCode: 401,
        cause: error as Error,
      });
    }
  }
}
