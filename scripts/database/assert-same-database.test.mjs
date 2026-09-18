import assert from 'node:assert/strict';
import { URL } from 'node:url';

const normalize = (value) => {
  const url = new URL(value);
  return `${url.protocol}//${url.hostname}:${url.port || '3306'}${url.pathname}`;
};
assert.notEqual(
  normalize('mysql://runner:secret@127.0.0.1:3306/one'),
  normalize('mysql://runner:secret@127.0.0.1:3306/two'),
);
assert.equal(
  normalize('mysql://runner:secret@127.0.0.1:3306/one'),
  normalize('mysql://runner:other@127.0.0.1:3306/one'),
);
console.log('same-database guard tests passed');
