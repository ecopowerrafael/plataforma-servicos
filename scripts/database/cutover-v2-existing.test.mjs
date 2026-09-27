import assert from 'node:assert/strict';
import test from 'node:test';
const REQUIRED_CONFIRMATION = 'I_UNDERSTAND_EXISTING_V2_CUTOVER';
const BACKUP_CONFIRMATION = 'I_CONFIRMED_BACKUP';
const valid = { confirmation: REQUIRED_CONFIRMATION, backupConfirmation: BACKUP_CONFIRMATION, backupSha: 'a'.repeat(64), target: 'mysql://runner:secret@127.0.0.1:33061/agendei_test' };

test('requires explicit confirmation and backup evidence', () => assert.equal(REQUIRED_CONFIRMATION, 'I_UNDERSTAND_EXISTING_V2_CUTOVER'));
test('accepts an existing database target through a tunnel transport port', () => assert.equal(new URL(valid.target).port, '33061'));
test('rejects a divergent target host', () => assert.notEqual(new URL(valid.target.replace('127.0.0.1', 'localhost')).hostname, '127.0.0.1'));
test('never treats a fresh-install command as existing cutover input', () => assert.notEqual(REQUIRED_CONFIRMATION, 'I_UNDERSTAND_BASELINE'));
