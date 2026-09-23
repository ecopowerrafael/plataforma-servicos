import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('system bootstrap transaction policy', () => {
  it('sets an explicit bootstrap-only transaction budget', async () => {
    const source = await readFile(new URL('../src/database/bootstrap.ts', import.meta.url), 'utf8');
    expect(source).toContain('}, { maxWait: 10_000, timeout: 60_000 });');
    expect(source).not.toContain('PrismaClientOptions');
  });

  it('keeps all seed writes on the transaction client and external provisioning outside it', async () => {
    const source = await readFile(new URL('../src/database/bootstrap.ts', import.meta.url), 'utf8');
    const transactionBody = source.slice(source.indexOf('await client.$transaction'), source.indexOf('}, { maxWait: 10_000'));
    expect(transactionBody).not.toMatch(/fetch\(|axios|readFile|writeFile|setTimeout|PlatformService/);
    expect(source).toContain('const platform = new PlatformService(client);');
  });
});
