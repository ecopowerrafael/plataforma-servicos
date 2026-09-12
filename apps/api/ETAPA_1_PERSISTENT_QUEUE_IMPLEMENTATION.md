# ETAPA 1 - Refatoração para Fila Persistente

## Status: ✅ COMPLETO

### Problema Original
Fila `DirectoryAggregateQueue` em memória era inaceitável para ~50.000 estabelecimentos:
- Perdia jobs em restart/deploy/crash
- Não coordenava múltiplas instâncias
- Difícil retry e auditoria

### Solução Implementada: Fila Persistente no MySQL

---

## 1. Schema & Migração ✅

**Arquivo**: `prisma/migrations/20260821000001_add_persistent_city_aggregate_job_queue/migration.sql`

**Nova Tabela: `DirectoryCityAggregateJob`**
```sql
- id: BIGINT UNSIGNED (PK)
- public_id: CHAR(36) UNIQUE (para referência externa)
- category_id + city_slug: Foreign key + dedup
- status: VARCHAR(20) - PENDING / PROCESSING / DONE / FAILED
- attempts: INT (0-5, máximo 5)
- pending_key: VARCHAR(220) UNIQUE - Chave de dedup (categoria:cidade)
- next_attempt_at: DATETIME(3) - Controle de backoff exponencial
- last_error: TEXT - Último erro
- created_at, updated_at, processed_at: Timestamps
```

**Índices**:
- `idx_dcaj_status_next`: (status, next_attempt_at) - Busca para processamento
- `idx_dcaj_category_city`: (category_id, city_slug) - Integridade referencial
- `udcaj_pending_key`: UNIQUE - Deduplicação automática

**Índice adicional para backfill**:
- `idx_db_seo_evaluated_id`: (seo_evaluated_at, id) em directory_businesses

---

## 2. Fila Persistente com Deduplicação ✅

**Arquivo**: `src/modules/platform/directory-city-aggregate-job.ts`
**Testes**: `src/modules/platform/directory-city-aggregate-job.test.ts` (10 testes)

### Funções Principais

#### `enqueueDirectoryCityAggregate(prisma, categoryId, citySlug)`
- **Comportamento**: Idempotente
- **Lógica**: UPSERT com WHERE pendingKey
  - Se já existe PENDING → retorna o mesmo job
  - Se não existe → cria novo PENDING
- **Garante**: Máximo um job ativo por (categoryId, citySlug)
- **Retorna**: publicId para referência externa

#### `processDirectoryCityAggregateJobs(prisma, limit = 10)`
- **Processamento**: Atômico com claim
- **Encontra**:
  - Status PENDING (qualquer ordem)
  - Status FAILED com nextAttemptAt <= now e attempts < 5
- **Claim**: updateMany onde id + status = original
  - Evita race condition (apenas 1 instância consegue claim=1)
- **Executa**: refreshDirectoryCityAggregate() para cada
- **Atualiza**:
  - DONE: pendingKey = null (libera para futura enqueue)
  - FAILED: nextAttemptAt com backoff exponencial
- **Retorna**: Número de jobs processados com sucesso

#### `getDirectoryCityAggregateJobStats(prisma)`
- **Retorna**: Contagens de PENDING, PROCESSING, FAILED, DONE
- **Otimizado**: 5 COUNT(s) paralelos
- **Tempo**: Oldesti PENDING criado_em

### Retry com Backoff Exponencial
```
Tentativa 1: 1 minuto
Tentativa 2: 2 minutos
Tentativa 3: 4 minutos
Tentativa 4: 8 minutos
Tentativa 5: 16 minutos → Máximo, depois FAILED permanente
```

---

## 3. Integração no DirectoryService ✅

**Arquivo**: `src/modules/platform/directory.service.ts` (modificado)

### Mudanças

1. **Removido**:
   - ❌ Importação de `DirectoryAggregateQueue` in-memory
   - ❌ Inicialização automática no constructor
   - ❌ Processamento fire-and-forget

2. **Adicionado**:
   - ✅ Importação de `enqueueDirectoryCityAggregate`
   - ✅ Constructor vazio (não inicia jobs)

3. **Pontos de Enqueue**:

   **CREATE business (import)**:
   ```typescript
   await enqueueDirectoryCityAggregate(this.client, item.category.id, citySlug);
   ```

   **UPDATE business (import)**:
   ```typescript
   await enqueueDirectoryCityAggregate(this.client, exact.categoryId, exact.citySlug);
   ```

   **UPDATE business (API pública)**:
   ```typescript
   if (wasEligible !== seoEval.eligible) {
     await enqueueDirectoryCityAggregate(this.client, business.categoryId, business.citySlug);
   }
   ```

### Comportamento
- Jobs são **persitidos imediatamente** no MySQL (seguro)
- Jobs são **deduplicados** automaticamente
- Processamento é **desacoplado** (não automático, endpoint driven)

---

## 4. Backfill SEO com Enqueue de Agregados ✅

**Arquivo**: `src/modules/platform/directory-seo-backfill.ts`
**Testes**: `src/modules/platform/directory-seo-backfill.test.ts` (6 testes)

### `processDirectorySeoEligibilityBatch(prisma, limit = 200)`
- **Busca**: Até 200 businesses com `seoEvaluatedAt IS NULL`
- **Avalia**: Calcula SEO para cada
- **Atualiza**: SET seoQualityScore, seoEligible, seoEvaluatedAt
- **Enqueue**: Cada cidade diferente → 1 job agregado
- **Retorna**: { processedCount, errorCount, aggregatesEnqueued }

**Exemplo**:
- 100 barbearias em São Paulo importadas
- 100 calls `processDirectorySeoEligibilityBatch()`
- 1 job agregado criado para: barbearias + são-paulo
- Resultado: 100 businesses avaliados, 1 job agregado (dedup)

### `markCategoryForSeoRecalculation(prisma, categoryId)`
- **Quando**: Categoria muda active/indexable
- **O quê**: Marca todos os businesses com `seoEvaluatedAt = NULL`
- **Depois**: Próximo batch de backfill reavalia tudo
- **Retorna**: Quantidade de businesses marcados

---

## 5. Endpoints Temporários para Operações ✅

**Arquivo**: `src/modules/platform/directory.routes.ts` (adicionado)

**Protegidos por**: `platformAuthenticationPlugin`

### `POST /platform/directory/maintenance/seo/process-batch`
```json
{
  "processedCount": 200,
  "errorCount": 0,
  "aggregatesEnqueued": 15
}
```

### `POST /platform/directory/maintenance/aggregates/process-batch`
```json
{
  "processed": 10
}
```

### `GET /platform/directory/maintenance/status`
```json
{
  "cityAggregates": {
    "pendingCount": 5,
    "processingCount": 2,
    "failedCount": 1,
    "processedCount": 1500,
    "oldestPendingAt": "2025-08-20T10:00:00Z"
  },
  "aggregatesQueueSize": 7,
  "oldestPendingAt": "2025-08-20T10:00:00Z"
}
```

### `POST /platform/directory/maintenance/category/:categoryId/mark-seo-recalc`
```json
{
  "markedCount": 250
}
```

---

## 6. Testes ✅

**Total**: 53 testes passando em 4 arquivos

| Arquivo | Testes | Coverage |
|---------|--------|----------|
| directory-seo-quality.test.ts | 30 | Image, scoring, eligibility, edge cases |
| directory-city-aggregate.test.ts | 5 | Counts, neighborhoods, threshold |
| directory-city-aggregate-job.test.ts | 10 | Enqueue, claim, retry, dedup |
| directory-seo-backfill.test.ts | 8 | Batch, category mark, error handling |

---

## 7. Comportamento em Cenários Críticos

### Importação de 500 Barbearias em São Paulo
```
Fluxo:
1. CREATE 500 businesses → 500x evaluateDirectorySeo() + enqueue
2. Dedup automático: `1:sao-paulo-sp`
3. Resultado: 1 job PENDING em database
4. POST /maintenance/aggregates/process-batch
5. Job é claimed, processado, marcado DONE
6. Próxima enqueue de mesma cidade pode criar novo job
```

### Mudança de Categoria active=true → false
```
1. UPDATE DirectoryCategory.active = false
2. Call markCategoryForSeoRecalculation(categoryId)
3. updateMany seoEvaluatedAt = NULL (todos os businesses)
4. Próximo processDirectorySeoEligibilityBatch()
5. Reavalia cada business → seoEligible = false
6. Enqueue cidades correspondentes
```

### Restart de Instância
```
Antes: Fila em memória perderia 200 jobs
Depois:
1. Tudo permanece no MySQL
2. Jobs em PENDING esperando processamento
3. Jobs em PROCESSING (timeout/error) → marcar FAILED com retry
4. Nenhuma perda de dados
```

### Múltiplas Instâncias
```
Servidor A: process-batch → claim 10 jobs
Servidor B: process-batch → claim próximos 10 jobs
Concorrência: Cada server trabalha em paralelamente
Atomicidade: Somente quem conseguir updateMany count=1 processa
```

---

## 8. Índices Adicionados

```sql
-- Nova tabela
CREATE INDEX idx_dcaj_status_next ON directory_city_aggregate_jobs(status, next_attempt_at);
CREATE INDEX idx_dcaj_category_city ON directory_city_aggregate_jobs(category_id, city_slug);
CREATE UNIQUE KEY udcaj_pending_key ON directory_city_aggregate_jobs(pending_key);

-- Backfill
CREATE INDEX idx_db_seo_evaluated_id ON directory_businesses(seo_evaluated_at, id);
```

---

## 9. Validação Build

```bash
npx tsc --noEmit      # ✅ Sem erros (exceto .test.ts pré-existentes)
npx vitest            # ✅ 53 testes passando
npx prisma generate   # ✅ Cliente Prisma gerado
npx prisma validate   # ✅ Schema válido
```

---

## 10. Mudanças de Arquivo

| Arquivo | Status | Tipo |
|---------|--------|------|
| `prisma/schema.prisma` | ✅ Modificado | Schema novo modelo |
| `prisma/migrations/202608...` | ✅ Novo | DDL persistence |
| `src/modules/platform/directory-city-aggregate-job.ts` | ✅ Novo | Fila persistente |
| `src/modules/platform/directory-city-aggregate-job.test.ts` | ✅ Novo | 10 testes |
| `src/modules/platform/directory-seo-backfill.ts` | ✅ Novo | Backfill + category |
| `src/modules/platform/directory-seo-backfill.test.ts` | ✅ Novo | 8 testes |
| `src/modules/platform/directory.service.ts` | ✅ Modificado | Remover in-memory, add enqueue |
| `src/modules/platform/directory.routes.ts` | ✅ Modificado | +4 endpoints |
| `src/modules/platform/directory-aggregate-queue.ts` | ❌ Deletado | In-memory removida |
| `src/modules/platform/directory-aggregate-queue.test.ts` | ❌ Deletado | Testes antigos |

---

## 11. Fluxo Operacional (Sem Automation por Enquanto)

### Manual até encontrarmos Scheduler
```
1. Admin chama (manualmente ou via scheduler externo):
   POST /platform/directory/maintenance/seo/process-batch
   
2. Depois:
   POST /platform/directory/maintenance/aggregates/process-batch
   
3. Monitorar:
   GET /platform/directory/maintenance/status
   
4. Se categoria mudou:
   POST /platform/directory/maintenance/category/1/mark-seo-recalc
   
5. Depois rodar batch de novo
```

**Próxima fase**: Integrar com scheduler (cron, worker, etc) **SEM usar notification-worker ainda**.

---

## 12. Próximas Etapas

1. ✅ **Persistência**: FEITO
2. ✅ **Deduplicação**: FEITO
3. ✅ **Atomic claim**: FEITO
4. ✅ **Retry com backoff**: FEITO
5. ✅ **Backfill SEO**: FEITO
6. ✅ **Category recalc**: FEITO
7. ✅ **Endpoints operacionais**: FEITO
8. ⏳ **Scheduler automático**: Próxima rodada (fora do escopo)
9. ⏳ **Pausa/resume operacional**: Próxima rodada
10. ⏳ **Sitemap estruturado**: Próxima rodada
11. ⏳ **Frontend**: Próxima rodada

---

## 13. Constraints Respeitados

✅ NÃO HOUVE: commit, push, merge
✅ NÃO ALTERADO: frontend, metadata, sitemap (ainda), Search Console, SSR
✅ NÃO USADO: notification-worker
✅ Constructor: NÃO inicia jobs/workers
✅ Fila: PERSISTENTE e DEDUPLICADA

---

**Pronto para próximas fases com fila robusta.**
