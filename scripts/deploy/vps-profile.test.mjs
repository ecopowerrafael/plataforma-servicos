import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFile(resolve(root, file), 'utf8');

const dockerfile = await read('deploy/vps/Dockerfile');
const compose = await read('deploy/vps/docker-compose.yml');
const deploy = await read('deploy/vps/deploy.sh');
const rollback = await read('deploy/vps/rollback.sh');
const backup = await read('deploy/vps/backup.sh');
const withoutComments = (value) => value.replace(/^[ \t]*#.*$/gmu, '');

assert.match(dockerfile, /npm run build:phase-a/);
assert.doesNotMatch(withoutComments(dockerfile), /migrate|bootstrap|db:push|reset/i);
assert.doesNotMatch(compose, /hbuilds|lsnode|Hostinger/i);
assert.match(compose, /mysql:8\.0/);
assert.match(compose, /caddy:2-alpine/);
assert.match(compose, /mysql_data:/);
assert.match(compose, /app_uploads:/);
assert.match(deploy, /build api/);
assert.doesNotMatch(withoutComments(deploy), /migrate|bootstrap|db:push|reset/i);
assert.match(rollback, /VPS_IMAGE_TAG/);
assert.match(backup, /--single-transaction/);
assert.match(backup, /--routines/);
assert.match(backup, /--triggers/);
assert.match(backup, /--events/);
assert.doesNotMatch(backup, /--password=.*MYSQL_PASSWORD/i);

console.log('VPS profile gate passed');
