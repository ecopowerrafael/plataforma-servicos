# Atualização de banco do Agendei

## Regra de decisão

| Situação | Processo |
|---|---|
| Banco vazio | aplicar `production-v1`, registrar baseline e aplicar incrementais |
| Banco existente | backup, validar histórico e aplicar somente pendências |
| Hotfix compatível | migration versionada e `migrate deploy` |
| Backfill | medir volume, validar duplicidades e executar em janela controlada |
| Incompatível | expand/contract ou manutenção; não iniciar API nova antes do fim |

## Procedimento

1. Confirmar host, banco, ambiente e versão MySQL/MariaDB.
2. Fazer backup verificável e registrar SHA-256.
3. Auditar migrations falhas, duplicidades e checksums.
4. Em novas instalações, executar `npm run db:generate:v2`,
   `npm run db:migrate:v2` e `npm run db:verify`. Em banco legado, seguir o
   runbook de transição e não misturar os diretórios de migrations.
5. Promover a nova aplicação somente depois de migrate e verify passarem.

Antes das quatro migrations WhatsApp, verificar duplicidades em
`prospecting_messages.idempotency_key`, nos eventos por
tenant/provider/instance/event e em `tenant_whatsapp_configs` por
provider/phone_number_id. Elas permanecem incrementais para bancos anteriores
à baseline.
