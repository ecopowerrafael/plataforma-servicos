import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const sharedIntegrationSource = readFileSync('packages/shared/src/integration.ts', 'utf8');
const metaConnectionSource = readFileSync('apps/api/src/modules/integrations/meta-whatsapp-connection.ts', 'utf8');
const connectionServiceSource = readFileSync('apps/api/src/modules/integrations/whatsapp-connection.service.ts', 'utf8');

describe('Meta WhatsApp safe configuration hydration', () => {
  it('adds only non-secret Meta fields to the connection response schema', () => {
    expect(sharedIntegrationSource).toContain('phoneNumberId: z.string().nullable().optional()');
    expect(sharedIntegrationSource).toContain('businessAccountId: z.string().nullable().optional()');
    expect(sharedIntegrationSource).toContain('apiVersion: z.string().nullable().optional()');
    expect(sharedIntegrationSource).toContain('tokenConfigured: z.boolean().optional()');
    expect(sharedIntegrationSource).toContain('appSecretConfigured: z.boolean().optional()');
    expect(sharedIntegrationSource).not.toContain('accessToken: z.string().nullable().optional()');
    expect(sharedIntegrationSource).not.toContain('appSecret: z.string().nullable().optional()');
  });

  it('returns non-secret Meta identifiers but never plaintext token or app secret', () => {
    expect(metaConnectionSource).toContain('phoneNumberId: config.phoneNumberId');
    expect(metaConnectionSource).toContain('businessAccountId: config.businessAccountId');
    expect(metaConnectionSource).toContain('apiVersion: config.apiVersion');
    expect(metaConnectionSource).toContain("tokenConfigured: config.encryptedAccessToken.trim() !== ''");
    expect(metaConnectionSource).toContain("appSecretConfigured: config.encryptedAppSecret !== null && config.encryptedAppSecret.trim() !== ''");
  });

  it('uses public labels while preserving provider enums internally', () => {
    expect(connectionServiceSource).toContain("provider: 'WAPI'");
    expect(connectionServiceSource).toContain("provider: 'META'");
    expect(connectionServiceSource).toContain("label: 'API não oficial'");
    expect(connectionServiceSource).toContain("label: 'API Oficial'");
  });
});
