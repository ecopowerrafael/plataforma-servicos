# Escala de Diretório SEO a 50.000 Estabelecimentos - PLANO ARQUITETÔNICO

## 1. ARQUITETURA ENCONTRADA

### Modelos Atuais
- **DirectoryBusiness**: 700+ linhas, 180+ chars fields (name, slug, citySlug, rawAddress, etc.)
  - Campos: active, indexable, relevanceScore, reviewStatus
  - Índices: (categoryId, citySlug, active), (city, state), (ibgeCode), (whatsapp), (phone), (tenantId)
  
- **DirectoryCategory**: singularName, pluralName, slug, seoTitle, seoDescription
  - Campos: active, indexable, externalSearchTerms, geoapifyCategories
  - Índices: (active, sortOrder)

- **DirectoryBusinessEvent**: PAGE_VIEW, WHATSAPP_CLICK tracking
  
- **DirectorySeoService**: Search Console sync, IndexNow, Inspections (preservar)

### Rotas Públicas
```
GET /public/directory/categories
GET /public/directory/categories/:categorySlug/cities
GET /public/directory/:categorySlug/:citySlug?page=N&limit=20
GET /public/directory/:categorySlug/:citySlug/:businessSlug
GET /sitemap-directory.xml?page=N
```

### Método cityBusinesses Atual
4 queries paralelos por request:
1. COUNT total
2. findMany(skip/take) paginado
3. COUNT com whatsapp
4. GROUP BY neighborhood (top 12)

### Sitemap Atual
- 1.000 URLs por página
- Raw SQL para GROUP BY categoryId, citySlug
- Sem segregação por elegibilidade

---

## 2. MUDANÇAS NECESSÁRIAS

### A. Schema: SEO Quality Score + Eligibility

```sql
ALTER TABLE directory_businesses ADD COLUMN seo_quality_score INT DEFAULT 0;
ALTER TABLE directory_businesses ADD COLUMN seo_eligible BOOLEAN DEFAULT false;
```

**Fórmula Exata (Total 100):**
```
IMAGEM = 0 PONTOS (NUNCA AFETA ELEGIBILIDADE)

Nome válido:              +20
Categoria válida:         +10
Cidade:                   +15
UF (2 chars):             +5
Endereço (rawAddress):    +15
Bairro:                   +5
CEP (8 chars):            +5
Telefone:                 +10
WhatsApp:                 +15
Website:                  +5
Tenant vinculado:         +10
─────────────────────────────────
Máximo 115 → Normalizar para 100
```

**Threshold:** seoEligible = TRUE somente se:
- active = true
- indexable = true
- category.active = true
- category.indexable = true
- name NOT EMPTY
- city NOT EMPTY
- state (2 chars)
- rawAddress NOT EMPTY
- (phone NOT NULL) OR (whatsapp NOT NULL)
- reviewStatus != 'DUPLICATED'
- **seoQualityScore >= 60**

### B. Função Central: evaluateDirectoryBusinessSeo()

```typescript
interface SeoEvaluation {
  score: number;           // 0-100
  eligible: boolean;       // meets threshold
  reasons: string[];       // MISSING_CONTACT, MISSING_ADDRESS, LOW_SCORE, etc.
}
```

Recalcular:
- ao CREATE business
- ao UPDATE business
- durante IMPORT
- ao vincular tenant (tenantId)
- quando categoria muda active/indexable

### C. Nova Tabela: DirectoryCityAggregate

```sql
CREATE TABLE directory_city_aggregates (
  id BIGINT AUTO_INCREMENT,
  category_id BIGINT NOT NULL,
  city_slug VARCHAR(180) NOT NULL,
  city VARCHAR(120),
  state CHAR(2),
  
  business_count INT DEFAULT 0,                    -- COUNT(*) active
  seo_eligible_business_count INT DEFAULT 0,       -- COUNT(*) active + seo_eligible
  whatsapp_count INT DEFAULT 0,                    -- COUNT(*) whatsapp NOT NULL
  top_neighborhoods JSON DEFAULT '[]',             -- Top 12 [{ name, count }]
  
  last_business_updated_at DATETIME(3) NULL,
  seo_eligible BOOLEAN DEFAULT false,              -- seoEligibleBusinessCount >= 3
  
  created_at DATETIME(3),
  updated_at DATETIME(3),
  
  UNIQUE (category_id, city_slug),
  INDEX (category_id, seo_eligible),
  INDEX (seo_eligible_business_count)
);
```

Atualizar via job/worker:
```
refreshDirectoryCityAggregate(categoryId, citySlug)
  MAX 20 cidades/tick
  Após CREATE/UPDATE business
```

### D. Índices Adicionados

```sql
CREATE INDEX idx_db_seo_eligible 
  ON directory_businesses(active, indexable, seo_eligible);

CREATE INDEX idx_db_category_city_seo 
  ON directory_businesses(category_id, city_slug, seo_eligible);

CREATE INDEX idx_db_seo_score 
  ON directory_businesses(seo_quality_score);
```

Índices MANTIDOS: todos os atuais (reutilizar).

### E. SEO Metadata por Categoria

```sql
ALTER TABLE directory_categories ADD COLUMN seo_near_me_title VARCHAR(180);
ALTER TABLE directory_categories ADD COLUMN seo_near_me_heading VARCHAR(180);
ALTER TABLE directory_categories ADD COLUMN seo_near_me_description VARCHAR(500);
```

**Defaults (se NULL):**
```
Title:  "${singularName} perto de mim: encontre ${pluralName.toLowerCase()} próximos | Agendei"
H1:     "Encontre um(a) ${singularName} perto de você"
Desc:   "Veja ${pluralName.toLowerCase()} próximos, endereços, bairros..."
```

---

## 3. REFATORAÇÃO: cityBusinesses

**Antes:** 4 queries + agregações inline
```
COUNT(*) + findMany + COUNT(whatsapp) + GROUP BY neighborhood
```

**Depois:** 2 queries clean
```
SELECT FROM directory_city_aggregates (cache de agregados)
+
SELECT FROM directory_businesses WHERE seo_eligible=true
```

---

## 4. SITEMAP ESTRUTURADO

**Novo:**
```
/sitemap-directory.xml (index)
  ├── sitemap-directory-categories.xml
  ├── sitemap-directory-cities-1.xml
  ├── sitemap-directory-cities-2.xml
  ├── sitemap-directory-businesses-1.xml
  ├── sitemap-directory-businesses-2.xml
  └── ...
```

**Critérios:**
- Categories: active=true, indexable=true, mín 1 business seo_eligible
- Cities: de DirectoryCityAggregate, seo_eligible=true (seoEligibleBusinessCount >= 3)
- Businesses: seo_eligible=true

**Estimativa 50k:**
~45-50 sitemaps (1.000 URLs cada)

---

## 5. CACHE HTTP

Adicionar a GET públicos:

```
/public/directory/categories
  Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=86400

/public/directory/categories/:categorySlug/cities
  Cache-Control: public, max-age=300, s-maxage=1800, stale-while-revalidate=86400

/public/directory/:categorySlug/:citySlug
  Cache-Control: public, max-age=120, s-maxage=900, stale-while-revalidate=3600

/public/directory/:categorySlug/:citySlug/:businessSlug
  Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=86400

/sitemap-directory*.xml
  Cache-Control: public, max-age=600, s-maxage=21600, stale-while-revalidate=86400
```

---

## 6. BACKFILL + JOB

**Migration:** Somente schema + índices.

**Job Separado:**
```
seoEligibilityBackfill(batchSize = 250)
  LOOP:
    SELECT 250 WHERE seo_eligible IS NULL
    Avaliar cada um
    UPDATE
    WAIT 1s
```

**Estimativa:** 50.000 / 250 = 200 batches ~ 3-5 minutos

---

## 7. CONFIRMAÇÕES EXPLÍCITAS

✅ **IMAGEM = 0 PONTOS**  
Imagem NÃO aumenta nem diminui score.  
Imagem NÃO impede elegibilidade.

✅ **Preserve URLs atuais**  
/encontre, /encontre/:category, /encontre/:category/:city, /encontre/:category/:city/:business

✅ **Preserve Search Console**  
DirectorySeoDailyMetric, DirectorySeoQueryMetric, regex ^https://agendei.site/encontre/

✅ **Sem SSR/prerender nesta rodada**

✅ **Sem páginas artificiais por keyword**

✅ **Sem bairros indexáveis nesta rodada**  
(Preparar estrutura, indexar próxima fase)

✅ **Máximo 50.000 escalável** com índices + agregados

✅ **MySQL only**  
Sem Redis/ES/ElasticSearch nesta rodada

---

## 8. TESTES (32 cenários)

1. ✓ Imagem ausente = 0 pontos
2. ✓ Imagem NÃO impede elegibilidade
3. ✓ Sem contato → não elegível
4. ✓ Endereço vazio → não elegível
5. ✓ Score < 60 → não elegível
6. ✓ Todos critérios + score >= 60 → elegível
7. ✓ indexable=false → não elegível
8. ✓ category.indexable=false → não elegível
9. ✓ Possível duplicata → não elegível
10. ✓ Agregado businessCount correto
11. ✓ Agregado seoEligibleBusinessCount correto
12. ✓ Agregado whatsappCount correto
13. ✓ Agregado neighborhoods extraídos (top 12)
14. ✓ Agregado seoEligible=true se >= 3 elegíveis
15. ✓ Agregado seoEligible=false se < 3
16. ✓ cityBusinesses usa agregado (sem GROUP BY)
17. ✓ Sitemap categoria inclui se elegível
18. ✓ Sitemap cidade inclui se >= 3 elegíveis
19. ✓ Sitemap business inclui se seoEligible=true
20. ✓ Sitemap dividido em 1.000 URLs
21. ✓ Categoria page metadata "perto de mim"
22. ✓ City page metadata usa cidade real
23. ✓ Business renderiza sem imagem
24. ✓ Paginação links máx 7 (evita DOM pesado)
25. ✓ Cache-Control em GET públicos
26. ✓ Search Console preservado
27. ✓ Métrica "perto de mim" queryable
28. ✓ Canonical página paginada mantém ?page=N
29. ✓ IndexNow enfileira somente seoEligible=true
30. ✓ Backfill não bloqueia requests
31. ✓ Todos testes directory existentes continuam passando
32. ✓ Performance cityBusinesses sem múltiplos GROUPs

---

## 9. ARQUIVOS A ALTERAR

| Arquivo | Mudança |
|---------|---------|
| prisma/schema.prisma | Adicionar colunas + novo modelo + índices |
| src/modules/platform/directory.service.ts | evaluateDirectoryBusinessSeo, refreshAggregate, refatorar cityBusinesses, sitemap novo |
| src/modules/platform/directory.routes.ts | Adicionar headers Cache-Control |
| apps/web/src/components/platform/DirectoryModule.tsx | Metadata "perto de mim", paginação links |
| worker.ts (ou novo) | Job seoEligibilityBackfill |
| *.test.ts | 32 novos testes |

**NÃO ALTERAR:**
- Search Console integrations
- IndexNow fila (apenas nova lógica IF seoEligible)
- URLs públicas

---

## 10. PRÓXIMAS FASES (Não nesta rodada)

- [ ] SSR/prerender
- [ ] ElasticSearch/Meilisearch
- [ ] URLs por bairro (/encontre/:category/:city/:neighborhood)
- [ ] IA para geração de textos
- [ ] Integração com mapas avançada
- [ ] Redis caching
- [ ] CDN/Cloudflare setup

---

**Pronto para implementação: SIM**  
**Sem commit/push conforme solicitado.**
