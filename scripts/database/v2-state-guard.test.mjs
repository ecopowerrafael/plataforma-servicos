import assert from 'node:assert/strict';
import test from 'node:test';
import { BASELINE_CHECKSUM, classifyV2State } from './v2-state-guard.mjs';

test('allows empty database', () => assert.equal(classifyV2State({ applicationTables: 0, baselineRows: 0 }).allowed, true));
test('allows registered V2 baseline', () => assert.equal(classifyV2State({ applicationTables: 159, baselineRows: 1, baselineChecksum: BASELINE_CHECKSUM }).state, 'v2'));
test('blocks legacy ledger', () => assert.equal(classifyV2State({ applicationTables: 159, baselineRows: 0 }).code, 'DATABASE_V2_CUTOVER_REQUIRED'));
test('blocks partial baseline', () => assert.equal(classifyV2State({ applicationTables: 159, baselineRows: 1, baselineChecksum: 'wrong' }).allowed, false));
test('blocks schema mismatch', () => assert.equal(classifyV2State({ applicationTables: 159, baselineRows: 1, baselineChecksum: BASELINE_CHECKSUM, schemaMatches: false }).allowed, false));
