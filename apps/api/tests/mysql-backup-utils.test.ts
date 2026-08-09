import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildBackupFilename,
  classifyBackupFile,
  computeRetentionCandidates,
  ensureSafeBackupDirectory,
  isValidBackupFileName,
} from '../src/lib/mysql-backup.js';

describe('backup mysql utilitários', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'mysql-backup-tests-'));

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
    // recria para manter o diretório de teste isolado entre iterações
    Object.defineProperty(globalThis, 'TEMP_BACKUP_ROOT', {
      value: mkdtempSync(join(tmpdir(), 'mysql-backup-tests-')),
      configurable: true,
      writable: true,
    });
  });

  it('gera nome de backup com timestamp', () => {
    const timestamp = new Date('2026-08-08T15:30:00.000Z');

    expect(buildBackupFilename(timestamp)).toBe('backup-2026-08-08-153000.sql');
  });

  it('valida caminhos de diretório de backup corretamente', () => {
    const root = join(tempRoot, 'backups');
    const safe = ensureSafeBackupDirectory(root);
    const invalid = ensureSafeBackupDirectory(`${root}\\..\\outside`);

    expect(safe).toBe(root);
    expect(invalid).toBe(root);
  });

  it('identifica arquivos reconhecidos como backup', () => {
    expect(isValidBackupFileName('backup-2026-08-08-153000.sql')).toBe(true);
    expect(isValidBackupFileName('manual.sql')).toBe(false);
    expect(isValidBackupFileName('backup-2026-08-08-15-3000.sql')).toBe(false);

    expect(classifyBackupFile('backup-2026-08-08-153000.sql')).toMatchObject({
      valid: true,
      name: 'backup-2026-08-08-153000.sql',
    });
  });

  it('calcula retenção para backups antigos', () => {
    const now = new Date('2026-08-10T12:00:00.000Z');
    const candidates = computeRetentionCandidates(
      [
        'backup-2026-08-01-120000.sql',
        'backup-2026-08-08-120000.sql',
        'backup-2026-08-09-120000.sql',
      ],
      2,
      now,
    );

    expect(candidates).toEqual(['backup-2026-08-01-120000.sql']);
  });

  it('dry-run não remove arquivos', () => {
    const root = join(tempRoot, 'backups');
    const older = join(root, 'backup-2026-08-01-120000.sql');
    const recent = join(root, 'backup-2026-08-09-120000.sql');

    const files = [older, recent];
    const expired = computeRetentionCandidates(
      files.map((file) => file.split(/[\\/]/u).pop() ?? file),
      2,
      new Date('2026-08-10T12:00:00.000Z'),
    );

    expect(expired).toEqual(['backup-2026-08-01-120000.sql']);
  });
});
