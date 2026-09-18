# Auditoria do histórico de migrations do Agendei

## Escopo e estado da auditoria

Auditoria estática realizada na branch `deploy/hostinger-node`, sem alterar o
histórico Prisma, sem conectar ou modificar bancos e sem commit/push.

Fontes consultadas:

- `apps/api/prisma/schema.prisma`;
- `apps/api/prisma/migrations/**`;
- `package.json` e `apps/api/package.json`;
- documentação de recuperação e baseline existente;
- estado do Git no momento da auditoria.

## Inventário estrutural

| Item | Resultado |
|---|---:|
| Diretórios de migration encontrados | 149 |
| Migrations rastreadas pelo Git | 145 arquivos `migration.sql` |
| Diretórios sem `migration.sql` | 1 |
| Diretório sem arquivo | `20260827152730_add_prospecting_flows` |
| Migrations explicitamente novas e não rastreadas | 4 WhatsApp |

O inventário detalhado por migration deve ser gerado por ferramenta a partir
dos arquivos SQL, com checksum SHA-256 calculado sobre o conteúdo exato. A
ausência de uma conexão autorizada ao snapshot impede afirmar, nesta etapa,
os campos “registrada no banco snapshot”, “funciona em banco vazio” e a
equivalência completa com o schema real.

## Inconsistências confirmadas

### Colisões de identificador temporal

Há mais de uma pasta usando o mesmo prefixo/data:

- `20260815000000`: `add_coupons`, `add_notification_campaigns`;
- `20260821000000`: `add_plan_feature_catalog`, `add_seo_quality_and_city_aggregates`;
- `20260825`: `add_prospecting_whatsapp_config`, `etapa3_worker_scheduler`;
- `20260826000000`: `add_objection_engine_fields`, `add_public_layout_and_service_icon`;
- `20260906000000`: `add_commercial_hierarchy`, `add_treatment_plans`;
- `20260910000000`: `add_scheduled_subscription_change`, `add_subscription_plan_changes`;
- `20260913000000`: três migrations distintas.

O Prisma usa o nome completo da pasta, portanto as colisões não são
automaticamente duplicatas de migration; contudo, tornam a ordenação e a
rastreabilidade temporal ambíguas e devem permanecer congeladas até existir
uma estratégia de baseline aprovada.

### Migration sem arquivo

`20260827152730_add_prospecting_flows` existe como diretório sem
`migration.sql`. Isso deve ser um erro bloqueante no gate de instalação nova.
Não é seguro removê-la ou inventar SQL antes de confirmar seu estado em todos
os bancos existentes.

### Dependência fora de ordem

`20260815120000_add_prospecting_flows` referencia `prospecting_campaigns`,
enquanto a documentação e o SQL indicam que a fundação correspondente aparece
em `20260824_prospecting_foundation`. O histórico linear, portanto, não é uma
fonte confiável para criar um banco vazio sem baseline.

### Migrations dependentes de dados

Foram identificados `INSERT`/`UPDATE` em migrations de WhatsApp, prospecção,
financeiro, assinaturas e reconciliação de conversas. Essas migrations exigem
pré-condições e validação de cardinalidade antes da aplicação em banco
existente; não devem ser tratadas como DDL puramente estrutural.

### Operações destrutivas ou de risco

O histórico contém `DROP INDEX`, `DROP COLUMN`, modificações de tipo e
reconstruções de constraints. O deploy deve executar backup/checkpoint e
interromper em qualquer divergência de checksum ou pré-condição não atendida.

## Quatro migrations WhatsApp

| Migration | Alteração | Backfill | Constraint | Baseline proposta |
|---|---|---|---|---|
| `20260915000001_add_wapi_remote_identity_mapping` | cria `wapi_remote_identity_mappings` | não | unique `(instance_id, remote_lid)` e índice por telefone | incorporar |
| `20260915000002_add_prospecting_inbound_idempotency` | unique em `prospecting_messages.idempotency_key` | não declarado; verificar nulos/duplicatas | unique `idempotency_key` | incorporar |
| `20260917000001_add_whatsapp_inbound_provider_idempotency` | adiciona `provider` e índice unique composto em eventos | default `WAPI`; auditar duplicatas antes | `(tenant_id, provider, instance_id, external_message_id, event_type)` | incorporar |
| `20260917000002_add_whatsapp_external_id_uniqueness` | unique em configurações WhatsApp | não; auditar duplicatas antes | `(provider, phone_number_id)` | incorporar |

As quatro continuam incrementais para bancos anteriores à baseline. Em banco
novo, somente o resultado final deve estar no `schema.sql`; não se deve
executá-las novamente depois de registrar corretamente a baseline.

## Decisão técnica proposta

1. Congelar o diretório histórico atual.
2. Produzir baseline a partir do schema Prisma, snapshot sanitizado e
   validação SQL real.
3. Registrar a baseline somente em banco vazio, com checksum e manifest.
4. Usar `migrate deploy` para bancos existentes, após auditoria de histórico,
   duplicidades e checksum.
5. Falhar o pipeline antes do start da API se migrate ou verify falhar.

## Blockers antes da implementação estrutural

- obter acesso autorizado ao snapshot sanitizado;
- confirmar versão efetiva MySQL/MariaDB;
- confirmar quais migrations estão registradas no snapshot;
- executar auditoria de duplicidades das quatro constraints WhatsApp;
- autorizar explicitamente a criação/remoção dos bancos de teste solicitados.

Até esses pontos serem resolvidos, não é seguro gerar uma baseline canônica
nem declarar a instalação nova reproduzível.

## Evidência adicional do ambiente local

Em 2026-09-17, `npm run db:status` conectou ao banco local
`agendei_integration_test` em `127.0.0.1:3306` e encontrou as 149 migrations
pendentes. Esse resultado prova que o banco não deve ser tratado como uma
instalação nova. O cliente `mysql` não está instalado no host; portanto, a
inspeção estrutural detalhada deve usar um cliente Prisma/driver autorizado ou
um snapshot exportado, sem aplicar migrations neste banco.

## Reconciliação definitiva das contagens

As contagens têm origens diferentes e não devem ser somadas cegamente:

| Contagem | Origem | Significado |
|---:|---|---|
| 149 | `fs.readdir` no diretório Prisma | diretórios de migration no worktree |
| 148 | gate estático após excluir o diretório sem SQL | migrations com `migration.sql` legível |
| 145 | `git ls-files` | arquivos `migration.sql` históricos rastreados |
| 145 | `SELECT COUNT(*) FROM _prisma_migrations` no snapshot | migrations registradas no snapshot |
| 4 | diferença local versus snapshot | quatro migrations WhatsApp novas |
| 149 | baseline fresh registrada | 145 históricas + 4 migrations WhatsApp |
| 0 | após o último migration local do worktree | incrementais posteriores à baseline |

O snapshot contém a migration histórica
`20260827152730_add_prospecting_flows` registrada, embora o arquivo local esteja
ausente. Os checksums históricos não são equivalentes aos SQL atuais em 142
casos; por isso o snapshot foi usado como fonte estrutural, e não como prova
de que o histórico local possa ser reaplicado linearmente.

## Amostra de checksums

Os arquivos locais estão em LF, sem BOM. A amostra abaixo foi comparada ao
campo `checksum` do snapshot:

| Migration | SHA-256 local | Checksum snapshot | Resultado |
|---|---|---|---|
| `20260804000000_initialize_system_metadata` | `0a0f6b64…` | `de65aeab…` | diverge |
| `20260815120000_add_prospecting_flows` | `5cb7fab3…` | `ff38f3b4…` | diverge |
| `20260824_prospecting_foundation` | `2d263021…` | `71e10620…` | diverge |
| `20260921000013_add_commercial_wallet_and_commissions` | `88b300ec…` | `6ea4ff1a…` | diverge |
| `20261011000002_add_commercial_remittances` | `f1d13f77…` | `f1d13f77…` | coincide |

O script legado `scripts/test-db/baseline-legacy-migrations.mjs` calcula
`SHA2(migration_name, 256)`, e não o SHA-256 do arquivo SQL. Portanto ele não
é uma fonte válida de checksums de migrations. A conclusão operacional é
obrigatória: enquanto 142 de 145 checksums divergirem, o histórico do snapshot
não pode ser autoridade para upgrade; somente uma cadeia V2 com baseline
canônica e checksums novos deve ser usada.
