import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const applicationSchema = path.join(root, 'apps/api/prisma/schema.prisma');
const v2Config = path.join(root, 'apps/api/prisma-v2/prisma.config.ts');
const duplicate = path.join(root, 'apps/api/prisma-v2/schema.prisma');
if (!fs.existsSync(applicationSchema) || !fs.existsSync(v2Config)) throw new Error('schema/config V2 ausente');
if (fs.existsSync(duplicate)) throw new Error('schema duplicado em apps/api/prisma-v2/schema.prisma');
const config = fs.readFileSync(v2Config, 'utf8');
if (!config.includes("schema: '../prisma/schema.prisma'")) throw new Error('config V2 não aponta para o schema canônico da aplicação');
const digest = crypto.createHash('sha256').update(fs.readFileSync(applicationSchema)).digest('hex');
console.log(JSON.stringify({ schema: 'apps/api/prisma/schema.prisma', v2SchemaReference: '../prisma/schema.prisma', sha256: digest, drift: false }));
