# Proposta de cadeia Prisma V2

## Estrutura proposta

```text
apps/api/prisma-v2/
  schema.prisma
  migrations/
    00000000000000_production_v1/
      migration.sql
```

`prisma-v2` terá configuração Prisma própria, baseline canônica e somente
migrations criadas após o marco `production-v1`. O diretório histórico atual
será preservado como `legacy-migrations` ou fonte documental, sem participar
do pipeline V2. Nenhum arquivo legado será movido antes da aprovação desta
proposta.

## Cutover WhatsApp

| Migration | Snapshot antigo | Integration atualizado | Baseline V1/V2 | Fresh | Servidor atual |
|---|---|---|---|---|---|
| `20260915000001_add_wapi_remote_identity_mapping` | ausente | aplicada | incorporada | incorporada | transição necessária |
| `20260915000002_add_prospecting_inbound_idempotency` | ausente | aplicada | incorporada | incorporada | transição necessária |
| `20260917000001_add_whatsapp_inbound_provider_idempotency` | ausente | aplicada | incorporada | incorporada | transição necessária |
| `20260917000002_add_whatsapp_external_id_uniqueness` | ausente | aplicada | incorporada | incorporada | transição necessária |

Instalações novas recebem o resultado na baseline e não reaplicam as quatro.
Bancos anteriores ao marco executam as quatro migrations de transição, após
auditoria de duplicidades, e então são registrados no marco V2.

## Implementação local

A cadeia foi materializada em `apps/api/prisma-v2/prisma.config.ts`, usando o
schema único em `../prisma/schema.prisma` e uma baseline única em
`migrations/00000000000000_production_v1/migration.sql`. O SQL da baseline e o
arquivo canônico `apps/api/prisma/baseline/production-v1/schema.sql` têm o
mesmo SHA-256:
`79eb73c0968209a730b84abd565f6a0de8d3076e63618ba01fb27315611cc2e6`.

O SQL não cria `_prisma_migrations`; essa tabela técnica é criada e administrada
pelo Prisma. O histórico legado permanece intacto e fora do pipeline V2. O
comando `test:database:fresh-install` agora aponta para o gate V2; o gate antigo
foi preservado apenas como `test:database:fresh-install:legacy` para diagnóstico.

O cutover do ledger de `agendei_integration_test` e a troca do comando oficial
de deploy ainda requerem uma etapa separada de revisão final do ledger e dos
workflows.

## Matriz de ambientes

| Ambiente | Forma de receber as alterações WhatsApp |
|---|---|
| Fresh/VPS nova | baseline `production-v1` V2 |
| Integration antigo | quatro migrations de transição, depois cutover V2 |
| Snapshot | somente leitura e comparação |
| Hostinger atual | backup, quatro migrations, verify, cutover e rollback conforme runbook |
| Futuras instalações | baseline V2 + incrementais posteriores |

## Impacto

- `prisma generate`: apontará para o schema V2/configuração V2;
- `migrate deploy`: lerá somente `prisma-v2/migrations`;
- produção atual: precisa de cutover, validação e registro do marco;
- fresh install: aplica baseline V2 e incrementais posteriores, sem legado;
- rollback: mantém versão anterior e usa checkpoint/compensação operacional;
- Hostinger/VPS: executam uma cadeia única, validada antes do start da API.

## Decisão pendente

Não mover o histórico nem trocar a configuração Prisma até validar a baseline
em fresh, concluir os testes funcionais e aprovar formalmente o cutover.
