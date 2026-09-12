# Migrations em Produção

## Contexto

Em ambientes de hospedagem compartilhada (como Hostinger), `prisma migrate deploy` pode travar ou falhar devido a limitações de WASM e timeout.

**Solução:** Separar migrations do build de produção.

---

## Novo Fluxo

### 1. Antes de Deploy com Nova Migration

#### Pré-requisitos locais:
```bash
# Configurar DATABASE_URL para produção
export DATABASE_URL="mysql://user:password@host/database"

# Ou criar arquivo .env.production (NÃO commitar)
echo "DATABASE_URL=mysql://user:password@host/database" > .env.production
```

#### Executar migrations localmente:
```bash
npm run db:migrate:production
```

Isso roda:
- `db:migrate:recover` — recupera migrations com falha
- `db:migrate:deploy` — aplica novas migrations

#### Validar aplicadas:
```bash
npx prisma migrate status
```

Saída esperada:
```
Migrations found in prisma/migrations
2 migrations already applied
0 migrations waiting to be applied
```

#### Se houve falha:
```bash
# Resolver manualmente e marcar como aplicada
npx prisma migrate resolve --applied <migration_name>
```

### 2. Fazer Deploy na Hostinger

O build de produção da Hostinger agora roda:

```bash
npm run build:production
```

Que executa:
- `db:generate` — sincronizar Prisma Client
- `build:shared` — compilar tipos compartilhados
- `build:api` — compilar API
- `build:web` — compilar frontend

**Nota:** Não roda migrations automaticamente.

### 3. Pós-Deploy (Validar)

Acessar SSH da Hostinger e validar schema:

```bash
mysql -h 127.0.0.1 -u user -p database
SHOW TABLES;
DESCRIBE <nova_tabela>;
```

---

## Scripts Disponíveis

| Script | O quê | Quando |
|--------|-------|--------|
| `npm run build` | Build completo com migrations (dev/CI) | Ambiente local ou CI com db |
| `npm run build:production` | Build sem migrations | Deploy em produção |
| `npm run db:migrate:production` | Apenas migrations | Antes de deploy com schema novo |
| `npm run db:migrate:dev` | Interactive migration | Desenvolvimento |

---

## Fluxo Recomendado

```
1. Desenvolver feature com nova tabela/coluna
2. Rodar migration localmente:
   npm run db:migrate:dev
3. Commitar migration (não altera production)
4. Antes de fazer deploy para Hostinger:
   export DATABASE_URL="mysql://prod_user:prod_pwd@prod_host/prod_db"
   npm run db:migrate:production
5. Validar no SSH da Hostinger
6. Push para deploy/hostinger-node
   - Hostinger roda: npm run build:production (sem migrations)
   - API usa novo schema já aplicado no banco
```

---

## Troubleshooting

### Prisma trava durante migrate
- ✅ Normal em hospedagem compartilhada
- ✅ Use `npm run db:migrate:production` localmente
- ✅ Se já falhou em produção, use `prisma migrate resolve`

### Nova migração não foi aplicada
```bash
# Validar status
npx prisma migrate status

# Se não foi aplicada, executar novamente
npm run db:migrate:production
```

### Erro de permissão no banco
```bash
# Validar credenciais
echo $DATABASE_URL

# Testar conexão direta
mysql -h <host> -u <user> -p <database>
```

---

## Segurança

- **Nunca** commit `.env.production` ou credenciais
- **Sempre** use variáveis de ambiente: `export DATABASE_URL=...`
- **Validar** schema no SSH após deploy
- **Backup** do banco antes de migration em produção

---

## Migração Futura (Se Hostinger melhorar suporte)

Se Hostinger passar a suportar `prisma migrate deploy` nativamente:

```json
{
  "build": "npm run db:generate && npm run build:shared && npm run db:migrate:deploy && npm run build:api && npm run build:web"
}
```

Voltar ao fluxo `npm run build` único.
