import assert from 'node:assert/strict';
import test from 'node:test';
import { decideExistingCutover } from './cutover-v2-existing-policy.mjs';
import { V2_STATES } from './v2-state-guard.mjs';

const ok = { confirmation: true, backupConfirmed: true, schemaCompatible: true, whatsappReady: true, noDuplicate: true, noPartialBaseline: true };
test('normal guard blocks cutover-required state', () => assert.equal(V2_STATES.CUTOVER, 'V2_CUTOVER_REQUIRED'));
test('existing cutover permits cutover-required state', () => assert.equal(decideExistingCutover({ ...ok, state: V2_STATES.CUTOVER }).allowed, true));
test('ready is idempotent', () => assert.equal(decideExistingCutover({ ...ok, state: V2_STATES.READY }).idempotent, true));
for (const state of [V2_STATES.PARTIAL, V2_STATES.MISMATCH, V2_STATES.EMPTY, V2_STATES.TARGET]) test(`blocks ${state}`, () => assert.equal(decideExistingCutover({ ...ok, state }).allowed, false));
for (const key of Object.keys(ok)) test(`blocks missing ${key}`, () => assert.equal(decideExistingCutover({ ...ok, state: V2_STATES.CUTOVER, [key]: false }).allowed, false));
test('tunnel transport is independent of server state classification', () => assert.equal(decideExistingCutover({ ...ok, state: V2_STATES.CUTOVER }).allowed, true));
