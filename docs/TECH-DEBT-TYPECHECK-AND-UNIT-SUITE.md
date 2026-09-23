# Dívida técnica preexistente — typecheck e suíte ampla

Este registro é separado da Fase A. O commit-base local é `8ed9dd07bb19ca72cfa82aab02e4788f41913316`; a referência `origin/deploy/hostinger-node` aponta para o mesmo SHA. Portanto, os erros abaixo pertencem ao estado-base ou a testes fora do pipeline de produção V2, não às alterações da Fase A.

## Typecheck amplo

Reprodução:

```text
npx tsc -p apps/api/tsconfig.json --noEmit
```

O comando falha em testes e fixtures amplos com erros de contratos Prisma, mocks desatualizados, propriedades obrigatórias ausentes, imports não usados e interfaces antigas. Exemplos reproduzíveis incluem `apps/api/src/modules/appointments/appointment-list-pagination.test.ts`, `apps/api/src/modules/collections/debt-dashboard.routes.test.ts`, `apps/api/src/modules/customers/customer-account.service.test.ts`, `apps/api/tests/prospecting.integration.test.ts` e `apps/api/tests/recovery-whatsapp.integration.test.ts`.

Esses arquivos não pertencem ao diff de produção V2; o typecheck de produção usado pela Fase A é:

```text
npx tsc -p apps/api/tsconfig.build.json --noEmit
```

O impacto é restrito ao typecheck amplo e não bloqueia o build de produção. A recomendação é atualizar os fixtures e mocks por domínio, em série, após a Fase A.

## Suíte unitária ampla

Reprodução:

```text
npm run test:unit
```

Há falhas preexistentes em testes de static web, tenant white-label, collections, customers, notifications, appointments, commercial e prospecting. A execução também apresentou arquivos que permanecem sem progresso no ambiente atual. Os testes críticos selecionados da Fase A, em contraste, passaram `87/87`.

O impacto é restrito à suíte ampla; não altera o resultado do gate crítico. A recomendação é isolar cada arquivo, corrigir contratos de mock e adicionar timeout por arquivo antes de reabrir o gate amplo.

Não misturar essa dívida técnica com os commits da Fase A.
