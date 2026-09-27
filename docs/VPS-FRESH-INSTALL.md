# Instalação nova do Agendei em VPS

## Requisitos e segurança

Usar Node conforme `.nvmrc`/`engines`, npm compatível com o lockfile, MySQL ou
MariaDB validado, usuário SQL dedicado e diretórios persistentes para uploads.
Configurar as variáveis de `.env.production.example`, sem versionar senhas,
tokens ou credenciais de gateways/WhatsApp.

## Instalação

```bash
npm ci --include=dev
npm run db:generate:v2
npm run test:database:fresh-install
npm run db:verify
npm run build:code
npm run start
```

O pipeline oficial é `prisma-v2`: baseline `production-v1` seguida apenas de
incrementais V2. O comando fresh exige confirmação explícita, URL local exata
nos testes, e não consulta o histórico legado. Não importa backup de produção.
Configurar API, workers, cron de `worker:once`, `/health` e `/ready`.
Validar login administrativo, rotas públicas, WhatsApp, prospecção e
financeiro. Manter a versão anterior até os health checks passarem.

## Transição do Hostinger atual

Esta operação não é executada localmente. O runbook é: backup verificável;
aplicação das quatro migrations WhatsApp após auditoria; `db:verify`; cutover
do ledger para `production-v1`; `db:generate:v2`; build; restart; `/health` e
`/ready`; rollback para a versão anterior se qualquer gate falhar.
