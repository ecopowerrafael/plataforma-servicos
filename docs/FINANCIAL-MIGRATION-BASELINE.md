# Financial migration baseline

O diretório Prisma canônico é `apps/api/prisma`, conforme `apps/api/prisma.config.ts` e os scripts do workspace. Não existem cópias Prisma na raiz.

O histórico contém inconsistências anteriores a esta entrega: `20260815120000_add_prospecting_flows` referencia `prospecting_campaigns`, criada somente por `20260824_prospecting_foundation`; `20260827152730_add_prospecting_flows` existia como diretório sem `migration.sql`; e também há a migration posterior `20260827152730_add_prospecting_flows`. O diretório vazio recebeu apenas um SQL no-op para que o Prisma consiga ler o histórico; nenhuma tabela histórica foi alterada. Migrations históricas não devem ser renomeadas, removidas ou reescritas nesta entrega.

Para novos ambientes, o baseline deve ser materializado a partir do commit `bb25e1d9b809909d3d5d4c73697a2ae517365587` em banco local terminado por `_test`, e somente as migrations representadas pelo schema-base devem ser marcadas como aplicadas. Depois, o worktree atual executa `prisma migrate deploy` normalmente. O bootstrap por baseline é uma operação de preparação de ambiente novo; não substitui o `migrate deploy` usado por ambientes existentes.

Os scripts em `scripts/test-db` recusam hosts não locais, bancos sem sufixo `_test`, limpeza fora de `NODE_ENV=test` e ausência de `MYSQL_INTEGRATION_DATABASE_URL`. Nenhum segredo é gravado ou impresso.
