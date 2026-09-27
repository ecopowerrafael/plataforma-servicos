# Hostinger — cutover V2

Este runbook separa o deploy seguro do cutover. A Fase A (`npm run build`) apenas gera e compila; não executa migration, `db push`, baseline ou bootstrap. Ela pode ser usada no deploy automático enquanto o banco atual ainda é legado.

A Fase B (`npm run build:phase-b:v2`) só deve ser habilitada após o cutover local aprovado. Ela exige `V2_DATABASE_URL`, valida `SELECT DATABASE()`, usuário e alvo, e bloqueia antes de qualquer DDL com `DATABASE_V2_CUTOVER_REQUIRED` quando encontra banco legado, baseline parcial, checksum divergente ou schema incompatível. Um ledger legado sozinho nunca autoriza deploy V2.

O alvo de produção não é alterado por este repositório. O procedimento futuro deve exportar schema/ledger para auditoria, aplicar as quatro migrations WhatsApp de transição no banco atual, validar o schema efetivo e registrar somente `00000000000000_production_v1`; banco novo pode iniciar vazio e receber a baseline. O snapshot permanece somente leitura.

As quatro migrations WhatsApp já estão materializadas na baseline e não devem ser reaplicadas em instalação nova. Em banco anterior ao marco, elas são aplicadas uma única vez como transição e então o banco é registrado no marco V2.

Rollback de aplicação é reversão do artefato/versão da aplicação. Rollback de DDL MySQL não é automático; exige backup, plano específico e aprovação. Não usar `db push`, reset ou scripts de teste em produção.

Checklist antes da Fase B: `test:database:v2-state`, `test:database:schema-drift`, `test:database:migration-files`, `test:production-critical`, `test:database:fresh-install`, revisão de grants e confirmação independente do host/banco. Só então alterar o comando de build do provedor.

## Cutover de banco existente e túnel SSH

Use `npm run db:cutover:v2:existing` para um banco legado estruturalmente compatível. O comando exige confirmação explícita e SHA-256 do backup, arquiva o ledger em `artifacts/database`, valida identidade e schema, não executa `schema.sql`, não apaga tabelas e registra somente `00000000000000_production_v1`. Após o marco, uma segunda execução retorna sucesso idempotente.

Em túnel SSH, `V2_DATABASE_URL` usa a porta local de transporte e `V2_EXPECTED_SERVER_PORT` usa a porta anunciada pelo MariaDB. Para o túnel Hostinger: `127.0.0.1:33061` e `V2_EXPECTED_SERVER_PORT=3306`. O bind deve ser somente em `127.0.0.1`.
