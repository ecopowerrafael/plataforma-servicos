import assert from 'node:assert/strict';
import test from 'node:test';
import { redact, safeError } from './sanitize.mjs';

const sentinel = 'SUPER_SECRET_SENTINEL_987654';
test('redacts URLs, env values, arguments and errors', () => {
  const value = `mysql://user:${sentinel}@127.0.0.1:3306/db MYSQL_PWD=${sentinel} DATABASE_URL=mysql://user:${sentinel}@localhost/db --password=${sentinel}`;
  const output = redact(value);
  assert.equal(output.includes(sentinel), false);
  assert.match(output, /mysql:\/\/user:\*\*\*@127/);
  assert.match(safeError(new Error(value)), /\[REDACTED\]/);
});
test('redacts serialized objects recursively', () => {
  const output = JSON.stringify(redact({ args: ['--password=' + sentinel], DATABASE_URL: 'mysql://u:' + sentinel + '@h/db', stderr: sentinel }));
  assert.equal(output.includes(sentinel), false);
});
