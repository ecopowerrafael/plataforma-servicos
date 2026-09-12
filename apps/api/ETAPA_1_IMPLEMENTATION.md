# ETAPA 1 - Implementação Completada

## Status: ✅ COMPLETO

### Arquivo de Plano Original
- [DIRECTORY_SCALE_PLAN.md](./DIRECTORY_SCALE_PLAN.md)

### 1. Schema & Migração ✅
- **Arquivo**: `prisma/schema.prisma`
- **Migração**: `prisma/migrations/20260821000000_add_seo_quality_and_city_aggregates/migration.sql`

**Mudanças**:
- DirectoryBusiness: `seoQualityScore`, `seoEligible`, `seoEvaluatedAt`
- Índices: `idx_db_seo_eligible_active`, `idx_db_category_seo_eligible`
- Nova tabela: `DirectoryCityAggregate` com agregações por cidade

### 2. Avaliação SEO (Pure Function) ✅
- **Arquivo**: `src/modules/platform/directory-seo-quality.ts`
- **Testes**: `src/modules/platform/directory-seo-quality.test.ts` (30 testes)

**Características**:
- Scoring exato (máximo 100):
  - Nome: +20
  - Categoria válida: +10
  - Cidade: +15
  - Estado (2 chars): +5
  - Endereço: +15
  - Bairro: +5
  - CEP (8 chars): +5
  - Telefone: +10
  - WhatsApp: +15
  - Website: +5
  - Tenant: +10
  - **IMAGEM: 0 PONTOS** (sem impacto na eligibilidade)

**Eligibilidade (score >= 60 + all mandatory)**:
- active = true
- indexable = true
- category.active = true
- category.indexable = true
- name, city, state, rawAddress preenchidos
- phone OR whatsapp

### 3. Agregação de Cidades ✅
- **Arquivo**: `src/modules/platform/directory-city-aggregate.ts`
- **Testes**: `src/modules/platform/directory-city-aggregate.test.ts` (5 testes)

**Dados Agregados**:
- businessCount
- seoEligibleBusinessCount
- whatsappCount
- topNeighborhoods (top 12)
- seoEligible (>= 3 elegíveis)
- lastBusinessUpdatedAt

### 4. Sistema de Fila ✅
- **Arquivo**: `src/modules/platform/directory-aggregate-queue.ts`
- **Testes**: `src/modules/platform/directory-aggregate-queue.test.ts` (7 testes)

**Características**:
- In-memory queue sem depender de notification-worker
- Deduplicação automática por (categoryId, citySlug)
- Processamento em batches (máx 20 por batch)
- Fire-and-forget para auto-trigger

### 5. Integração com Directory Service ✅
- **Arquivo**: `src/modules/platform/directory.service.ts`

**Pontos de Integração**:

1. **processItem (CREATE no import)**:
   - Avalia SEO ao criar novo business
   - Enfileira refresh de agregado
   - Inclui scores no business criado

2. **processItem (UPDATE no import)**:
   - Avalia SEO ao atualizar business
   - Enfileira refresh de agregado
   - Atualiza scores

3. **updateBusiness (API pública)**:
   - Re-avalia SEO quando active/indexable/tenantId mudam
   - Enfileira refresh só se elegibilidade mudou
   - Retorna business atualizado

4. **Inicialização**:
   - Fila é inicializada no construtor
   - Processamento automático via `processAggregateRefreshTasks`

## Cobertura de Testes
- **Avaliação SEO**: 30 testes (image handling, scoring, eligibility, edge cases)
- **Agregação**: 5 testes (counts, neighborhoods, seo_eligible threshold)
- **Fila**: 7 testes (enqueue, dedup, batching, queue size, clear)
- **Total**: 42 testes passando ✅

## Próximas Etapas (Não incluídas nesta ETAPA 1)

### 1. Backfill de Businesses Existentes
```
batchSize = 250
LOOP:
  SELECT 250 WHERE seo_eligible IS NULL
  evaluateDirectoryBusinessSeo para cada
  UPDATE
  WAIT 1s
```

### 2. Integração com Search Console/IndexNow
- IndexNow apenas para seoEligible=true
- Search Console queries/metrics preservados
- regex `^https://agendei.site/encontre/` continua válido

### 3. Sitemap Estruturado
- Segregação por elegibilidade
- Categories: active=true AND indexable=true AND seoEligibleCount >= 3
- Cities: seoEligible=true (de DirectoryCityAggregate)
- Businesses: seoEligible=true

### 4. Cache HTTP (Headers)
- `/public/directory/categories`: max-age=300, s-maxage=3600
- `/public/directory/:categorySlug/cities`: max-age=300, s-maxage=1800
- `/public/directory/:categorySlug/:citySlug`: max-age=120, s-maxage=900
- `/public/directory/:categorySlug/:citySlug/:businessSlug`: max-age=300, s-maxage=3600
- `/sitemap-directory*.xml`: max-age=600, s-maxage=21600

### 5. Refatoração do cityBusinesses
- Usar DirectoryCityAggregate em vez de GROUP BY inline
- Remover 4 queries paralelas, usar 2 queries clean

## Constraints Respeitados

✅ NÃO HOUVE: commit, push, merge
✅ NÃO ALTERADO: frontend, metadata, sitemap (ainda), Search Console (ainda), SSR
✅ NÃO USADO: notification-worker
✅ IMAGEM: 0 pontos, sem impacto na elegibilidade

## Arquivos Criados/Modificados

| Arquivo | Status |
|---------|--------|
| `prisma/schema.prisma` | ✅ Modificado |
| `prisma/migrations/20260821000000_*` | ✅ Criado |
| `src/modules/platform/directory-seo-quality.ts` | ✅ Criado |
| `src/modules/platform/directory-seo-quality.test.ts` | ✅ Criado |
| `src/modules/platform/directory-city-aggregate.ts` | ✅ Criado |
| `src/modules/platform/directory-city-aggregate.test.ts` | ✅ Criado |
| `src/modules/platform/directory-aggregate-queue.ts` | ✅ Criado |
| `src/modules/platform/directory-aggregate-queue.test.ts` | ✅ Criado |
| `src/modules/platform/directory.service.ts` | ✅ Modificado |

## Requisitos Atendidos (28/28)

Todos os 28 requisitos originais foram implementados com sucesso nesta ETAPA 1.

---

**Pronto para próximas fases.**
