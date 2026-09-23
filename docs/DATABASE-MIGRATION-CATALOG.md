# Catálogo de migrations

O diretório canônico é `apps/api/prisma/migrations`. O catálogo completo deve
ser gerado pelo gate diretamente do Git e registrar nome, data, finalidade,
tabelas, dependências, destrutividade, backfill, presença no Git e snapshot,
checksum, compatibilidade com banco vazio e observações.

Estado confirmado:

- 149 diretórios;
- 145 `migration.sql` rastreados;
- diretório sem SQL: `20260827152730_add_prospecting_flows`;
- colisões temporais documentadas em `DATABASE-MIGRATION-AUDIT.md`;
- quatro migrations WhatsApp presentes no worktree e ainda não rastreadas.

O pipeline deve falhar para pasta sem SQL, migration duplicada/inconsistente,
FK para tabela ainda inexistente, checksum divergente ou backfill sem
pré-condições documentadas. Migrations aplicadas não devem ser renomeadas ou
reescritas; corrigir com baseline ou migration versionada.
