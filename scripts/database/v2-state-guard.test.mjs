import assert from 'node:assert/strict';
import test from 'node:test';
import { BASELINE_CHECKSUM, classifyV2State, expectedServerPort, parseAllowedExtraTables, V2_STATES } from './v2-state-guard.mjs';

test('classifies empty database as unsafe for normal guard', () => assert.equal(classifyV2State({ applicationTables: 0, baselineRows: 0 }).state, V2_STATES.EMPTY));
test('classifies registered V2 baseline as ready', () => assert.equal(classifyV2State({ applicationTables: 159, baselineRows: 1, baselineChecksum: BASELINE_CHECKSUM }).state, V2_STATES.READY));
test('classifies legacy ledger as cutover required', () => assert.equal(classifyV2State({ applicationTables: 159, baselineRows: 0 }).state, V2_STATES.CUTOVER));
test('classifies partial baseline', () => assert.equal(classifyV2State({ applicationTables: 159, baselineRows: 1, baselineChecksum: 'wrong' }).state, V2_STATES.PARTIAL));
test('classifies schema mismatch', () => assert.equal(classifyV2State({ applicationTables: 159, baselineRows: 1, baselineChecksum: BASELINE_CHECKSUM, schemaMatches: false }).state, V2_STATES.MISMATCH));
test('accepts a tunnel transport port with explicit server port', () => assert.equal(expectedServerPort('3306', '33061'), '3306'));
test('rejects invalid explicit server ports', () => {
  for (const value of ['', '0', '65536', '33x', '3306.0']) assert.throws(() => expectedServerPort(value, '33061'), /INVALID/);
});
test('keeps direct-port compatibility when unset', () => assert.equal(expectedServerPort(undefined, '3306'), '3306'));
test('allows exactly the three approved legacy extras', () => assert.equal(classifyV2State({ applicationTables: 162, baselineRows: 1, baselineChecksum: BASELINE_CHECKSUM, extraTables: ['a','b','c'], allowedExtraTables: ['a','b','c'] }).state, V2_STATES.READY));
test('blocks an unapproved extra', () => assert.equal(classifyV2State({ applicationTables: 160, baselineRows: 1, baselineChecksum: BASELINE_CHECKSUM, extraTables: ['x'], allowedExtraTables: [] }).state, V2_STATES.MISMATCH));
test('rejects wildcard, partial and duplicate allowlist entries', () => {
  assert.throws(() => parseAllowedExtraTables('foo*'), /INVALID/);
  assert.equal(parseAllowedExtraTables('foo_bar')[0], 'foo_bar');
  assert.throws(() => parseAllowedExtraTables('foo,foo'), /DUPLICATE/);
});
test('allowlist never compensates for a missing canonical table', () => assert.equal(classifyV2State({ applicationTables: 1, baselineRows: 1, baselineChecksum: BASELINE_CHECKSUM, schemaMatches: false, extraTables: ['a'], allowedExtraTables: ['a'] }).state, V2_STATES.MISMATCH));
