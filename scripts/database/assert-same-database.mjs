import { URL } from 'node:url';

const ddlUrl = process.env.DDL_DATABASE_URL;
const ledgerUrl = process.env.LEDGER_DATABASE_URL;
if (!ddlUrl || !ledgerUrl) throw new Error('DDL_DATABASE_URL e LEDGER_DATABASE_URL são obrigatórias');
const identity = (value) => {
  const url = new URL(value);
  return `${url.protocol}//${url.hostname}:${url.port || '3306'}${url.pathname}`;
};
const ddl = identity(ddlUrl);
const ledger = identity(ledgerUrl);
if (ddl !== ledger) throw new Error(`DDL e ledger devem apontar para o mesmo banco (${ddl} != ${ledger})`);
console.log(JSON.stringify({ sameDatabase: true, target: ddl }));
