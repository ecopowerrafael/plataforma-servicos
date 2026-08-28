# Recuperação de Migration Parcial: 20260815120000_add_prospecting_flows

## Situação Atual

**Data**: 2026-08-28  
**Migration**: `20260815120000_add_prospecting_flows`  
**Status em Produção**: FAILED (Partial)  
**Commit de Código**: 48ac64e

### O que foi criado (com sucesso):
- ✅ `prospecting_flows`
- ✅ `prospecting_flow_steps`
- ✅ `prospecting_flow_options`
- ✅ `prospecting_flow_option_patterns`
- ✅ `prospecting_campaigns.flow_id` (coluna + FK + índice)

### O que está faltando (não foi criado):
- ❌ `prospecting_flow_executions`
- ❌ `prospecting_flow_responses`

---

## Próximos Passos (Hostinger/Produção)

### 1. Executar SQL Manual

O arquivo `prospecting_flow_runtime_tables.sql` contém o SQL para criar APENAS as duas tabelas faltantes, baseado no **schema.prisma ATUAL** (não na migration antiga).

**Diferenças vs migration 20260815120000 original:**
- `status` é `ENUM` (não `VARCHAR`)
- `ON DELETE CASCADE` (não `RESTRICT`)
- Sem índice em `started_at`
- `response_text` é `TEXT` (não `LONGTEXT`)

**Executar em Hostinger:**
```sql
-- Copiar conteúdo de prospecting_flow_runtime_tables.sql e executar
```

### 2. Validar Criação

```sql
-- Verificar tabelas
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME IN ('prospecting_flow_executions', 'prospecting_flow_responses');

-- Verificar colunas
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'prospecting_flow_executions'
ORDER BY ORDINAL_POSITION;

-- Verificar FKs
SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME IN ('prospecting_flow_executions', 'prospecting_flow_responses')
AND CONSTRAINT_NAME != 'PRIMARY';
```

### 3. Resolver Migration no Prisma

Depois que o SQL manual foi executado com sucesso:

```bash
npx prisma migrate resolve --applied 20260815120000_add_prospecting_flows
```

Isto **marca a migration como aplicada** no Prisma, sem tentar executá-la novamente.

---

## Estado Local (Este Repositório)

- ✅ Commit 48ac64e: `FIX MIGRATION — compatibilidade MariaDB Prospecting Flow`
  - Corrigiu `20260815120000_add_prospecting_flows` para usar ENUM inline
  - Adicionou `ON UPDATE CURRENT_TIMESTAMP(3)` em `updated_at`
  
- ❌ Removida migration `20260828000000_add_prospecting_flow_runtime`
  - Era redundante (já coberta por 20260815120000)
  - Evita conflito ao recuperar 20260815120000

- 📄 Criado: `prospecting_flow_runtime_tables.sql`
  - SQL manual para completar tabelas faltantes
  - Baseado no schema.prisma ATUAL

---

## Histórico de Commits

| Commit | Mensagem | Ação |
|--------|----------|------|
| b146357 | FIX — Prospecting Flow fechar fase C definitivamente | Implementação Phase C concluída |
| 3bf67ec | MIGRATION — adicionar runtime do Prospecting Flow | ⚠️ SQL incompatível (PostgreSQL) |
| 48ac64e | FIX MIGRATION — compatibilidade MariaDB | ✅ SQL corrigido + 20260828000000 removida |

---

## Schema Resultante (Esperado)

### prospecting_flow_executions
```
id                  BIGINT UNSIGNED (PK)
public_id           CHAR(36) (UNIQUE)
campaign_id         BIGINT UNSIGNED (FK → prospecting_campaigns, CASCADE)
lead_id             BIGINT UNSIGNED (FK → prospecting_leads, CASCADE)
flow_id             BIGINT UNSIGNED (FK → prospecting_flows, CASCADE)
current_step_id     BIGINT UNSIGNED (FK → prospecting_flow_steps)
status              ENUM('ACTIVE', 'WAITING', 'MANUAL', 'COMPLETED', 'CANCELED')
started_at          DATETIME(3) (default NOW())
completed_at        DATETIME(3) (nullable)
created_at          DATETIME(3) (default NOW())
updated_at          DATETIME(3) (default NOW() + ON UPDATE)

UNIQUE(campaign_id, lead_id, flow_id)
INDEX(campaign_id, lead_id, flow_id, status)
```

### prospecting_flow_responses
```
id                  BIGINT UNSIGNED (PK)
execution_id        BIGINT UNSIGNED (FK → prospecting_flow_executions, CASCADE)
step_id             BIGINT UNSIGNED (FK → prospecting_flow_steps)
inbound_message_id  BIGINT UNSIGNED (nullable)
response_text       TEXT
matched_option_id   BIGINT UNSIGNED (nullable, FK → prospecting_flow_options)
created_at          DATETIME(3) (default NOW())

INDEX(execution_id, step_id)
```

---

## Notas

- Não editar a migration 20260815120000 após recuperação
- Não recriar as 4 primeiras tabelas (já existem)
- Não executar `prisma migrate deploy` até após SQL manual e `migrate resolve`
- Validar FKs, índices e valores de ENUM após execução

---

**Próximo**: Após validação de produção, fazer deploy da Fase C com `PROSPECTING_FLOW_ENABLED=true`
