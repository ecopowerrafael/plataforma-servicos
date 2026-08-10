# Deploy na hospedagem Node.js compartilhada da Hostinger

Guia para colocar a plataforma no ar na **hospedagem Node.js gerenciada** da
Hostinger (painel hPanel > "Node.js"), com o **mínimo de alterações** na
arquitetura. A branch `deploy/hostinger-node` só adiciona adaptações de deploy;
nenhuma regra de negócio foi alterada e nenhuma funcionalidade da `master` foi
removida.

## Requisitos

- **Node.js 22.x** — selecione no painel. O projeto fixa
  `engines.node >= 22.0.0` (e traz um `.nvmrc` com `22`).
- MySQL da Hostinger (criado no hPanel).
- **As ferramentas de build ficam em `dependencies`** (TypeScript, Prisma CLI,
  Vite, `@types/*` usados na compilação), então o build **funciona mesmo com um
  `npm install` em modo produção** — não depende de o painel instalar
  devDependencies. As devDependencies restantes (ESLint, Vitest) são só para
  desenvolvimento/testes.
- **Geração do Prisma Client é automática no build:** os scripts `build` e
  `typecheck` da API rodam `prisma generate` como `pre`-hook, então o cliente em
  `apps/api/src/database-client` (não versionado) é gerado antes de qualquer
  `tsc`, **independentemente do comando** que o painel executar.

## Resumo dos comandos (para o painel Web App da Hostinger)

| Campo | Valor |
| --- | --- |
| **Framework** | Other |
| **Node version** | `22.x` |
| **Root directory** | `./` |
| **Build command** | `npm run build` |
| **Output directory** | *(vazio — a API serve o frontend)* |
| **Entry file** | `apps/api/dist/server.js` |

O **`npm run build`** (o único comando que o painel oferece) já é o **pipeline
completo de produção**: aplica migrations e bootstrap (e provisiona o Super
Admin) automaticamente — não é necessário nenhum comando por SSH. Detalhes na
seção 2. A aplicação é iniciada pelo **Entry file** `apps/api/dist/server.js`,
que escuta em `process.env.PORT` (host `0.0.0.0`).

## Modelo adotado: single-origin (uma aplicação só)

A própria API Fastify passa a **servir o frontend Vite compilado** e a fazer o
**fallback SPA**. Assim, API e site respondem no **mesmo domínio** — não há CORS
entre eles, e você configura **um único aplicativo Node** no painel.

```
Navegador ──HTTPS──> [ App Node (Fastify) ]
                        ├── /            → apps/web/dist/index.html (SPA)
                        ├── /assets/*    → arquivos estáticos do build
                        ├── /health      → JSON
                        ├── /auth/*, /tenant/*, /platform/*, /public/*, … → API JSON
                        └── (rota não encontrada + Accept: text/html) → index.html
                     [ MySQL da Hostinger ]
```

---

## 1. Pasta que deve ser enviada

Envie o **repositório inteiro** (é um monorepo npm workspaces; a API depende de
`packages/shared` e de `apps/web/dist`). Não dá para enviar só uma subpasta.

Suba para a pasta da aplicação Node no servidor (ex.: `~/app` ou o diretório que
o painel indicar como raiz da aplicação):

- `apps/` (api, web)
- `packages/` (shared)
- `package.json`, `package-lock.json`
- `docs/`, `tsconfig*.json` etc.

**Não** envie: `node_modules/`, qualquer `.env` com credenciais, `apps/*/dist`
(será gerado no servidor), `uploads/`/`storage/` locais de teste.

> Dica: gere um zip a partir de um checkout limpo da branch, sem `node_modules`.

---

## 2. Comando de build

No painel Node da Hostinger, o **Build command** é simplesmente:

```bash
npm run build
```

(o painel roda `npm install` antes do build command automaticamente. O `npm run
build` **na branch `deploy/hostinger-node` é o pipeline completo de produção** —
não é o build de código puro.)

`npm run build` é **autossuficiente** e executa, **nesta ordem exata**, falhando
o deploy inteiro se qualquer passo falhar (sem mascarar erro):

1. `prisma generate` — gera o Prisma Client (`apps/api/src/database-client`, não
   versionado) **antes** de qualquer TypeScript que o importe.
2. `build:shared` (`@plataforma/shared`) — necessário antes do bootstrap, que
   importa esse pacote.
3. `prisma migrate deploy` — aplica **apenas as migrations pendentes** já
   versionadas (nunca `migrate dev`/`db push`/reset). Se não houver pendentes,
   segue normalmente.
4. `db:bootstrap` — semeia papéis/permissões/roles globais de forma
   **idempotente** (só `upsert`/`skipDuplicates`) e, quando
   `PLATFORM_ADMIN_EMAIL`/`PLATFORM_ADMIN_PASSWORD` existem, **provisiona o Super
   Admin** de forma idempotente (cria o usuário com senha só em hash Argon2 se
   não existir; se já existir, não altera a senha).
5. `build:api` e `build:web`.

Os scripts auxiliares `build:shared`/`build:api`/`build:web` fazem apenas a
compilação de cada workspace (sem banco) — `npm run build` os orquestra na
ordem acima, sem recursão. `build:code` compila os três sem tocar no banco.

Migrations e bootstrap usam a conexão montada a partir das variáveis `DB_*`
(não exigem `DATABASE_URL`; a senha nunca é impressa em log).
As ferramentas de build ficam em `dependencies`, então funciona mesmo com
install em modo produção.

> **Você não precisa rodar `npm run db:migrate` nem `npm run db:bootstrap`
> manualmente por SSH.** O deploy pelo GitHub já faz isso automaticamente.

> ⚠️ O `prisma generate` **não** exige `DATABASE_URL`: a URL é montada a partir
> das variáveis `DB_*` (seção 4/5). Configure-as (ou a `.env`) antes do build.
>
> ⚠️ O build do frontend precisa da variável `VITE_API_URL` já definida no
> ambiente **no momento do build** (ela é embutida no bundle). Garanta que o
> `.env` de produção já exista antes de buildar o web. Veja a seção 4.

As migrações do banco e o bootstrap **já rodam dentro de `npm run build`** a
cada deploy — não é preciso executá-los à parte. Para criar o primeiro Super
Admin, veja a seção 11.

---

## 3. Comando/arquivo de start

No painel Node, defina:

- **Application startup file / start command:**

  ```bash
  npm run start
  ```

  (equivale a `node apps/api/dist/server.js`).

- **Application root:** a raiz do projeto (onde está o `package.json` de topo).

A porta é lida de `process.env.PORT` automaticamente (a Hostinger injeta essa
variável) — não fixe uma porta. O host padrão é `0.0.0.0`.

`npm run start` executa `node apps/api/dist/server.js` a partir da **raiz** do
projeto. Em produção a API **serve o frontend automaticamente** (localiza
`apps/web/dist` mesmo sem `WEB_DIST_DIR`, de forma independente do diretório de
trabalho), com fallback SPA — rotas do React (ex.: `/planos`) devolvem o
`index.html`, e as rotas de API continuam devolvendo JSON.

> Se preferir apontar o start file diretamente, use
> `apps/api/dist/server.js`. Não use `tsx`/`ts-node` em produção — rode o
> JavaScript já compilado em `dist`.

---

## 4. Variáveis de ambiente necessárias

Crie um `.env` na raiz do projeto no servidor (ou preencha as variáveis pelo
painel Node da Hostinger). Use **`.env.production.example`** como base. Nunca
versione o `.env` real.

Mínimo obrigatório:

| Variável | Exemplo | Observação |
| --- | --- | --- |
| `NODE_ENV` | `production` | ativa regras de segurança (cookie Secure, HTTPS). |
| `DB_HOST` | `127.0.0.1` | padrão `127.0.0.1` se omitido. |
| `DB_PORT` | `3306` | padrão `3306` se omitido. |
| `DB_NAME` | `u000000000_agendei` | **obrigatório** em produção. |
| `DB_USER` | `u000000000_agendei` | **obrigatório** em produção. |
| `DB_PASSWORD` | *(do painel Hostinger)* | **obrigatório** em produção; nunca versione. |
| `DB_CONNECTION_LIMIT` | `5` | padrão `5` se omitido. |
| `CORS_ORIGINS` | `https://agendei.site,https://www.agendei.site` | domínio(s) público(s); nunca `*`. |
| `VITE_API_URL` | `https://agendei.site` | mesmo domínio (single-origin); embutida no build do web. |
| `APP_WEB_URL` | `https://agendei.site` | usada em links de e-mail; deve ser HTTPS. |
| `WEB_DIST_DIR` | *(opcional)* | frontend servido pela API. **Auto-detectado** em produção (`apps/web/dist`); só defina se o dist estiver em outro caminho. |
| `AUTH_COOKIE_SECURE` | `true` | obrigatório em produção. |
| `LOG_LEVEL` | `info` | |

**Banco: NÃO é necessário configurar `DATABASE_URL`.** A aplicação e a CLI do
Prisma (via `prisma.config.ts`) montam a connection string internamente a partir
de `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`/`DB_CONNECTION_LIMIT`,
fazendo URL-encoding de usuário, senha e nome do banco. Se você **quiser**,
`DATABASE_URL` ainda pode ser definida e tem prioridade — mas não é obrigatória.
A senha/URL completa **nunca** é escrita em log.

Porta/host: **não** defina `API_PORT` — a Hostinger fornece `PORT`. `API_HOST`
assume `0.0.0.0`.

Uploads (recomendado apontar para diretório persistente — seção 6):
`SERVICE_IMAGE_STORAGE_DIR`, `TENANT_MEDIA_STORAGE_DIR`,
`PROFESSIONAL_IMAGE_STORAGE_DIR`.

Opcionais (só se for usar; podem ficar em branco): `SMTP_*` (e-mail
transacional), `VAPID_*` (web push), `PAYMENT_GATEWAY_ENCRYPTION_KEY` (gateways
de pagamento), `PUBLIC_BASE_DOMAIN` (sites de tenant por subdomínio). Essas
chaves devem permanecer **estáveis** após entrar em produção — não as regenere a
cada deploy.

O restante (Argon2, rate limit, TTLs) tem padrões seguros — só ajuste se
necessário. A lista completa comentada está em `.env.production.example`.

---

## 5. Configuração do MySQL

1. No hPanel: **Bancos de dados MySQL** → crie um banco e um usuário, anote
   host, porta, nome do banco, usuário e senha.
2. Configure as variáveis `DB_*` (seção 4) — **não** monte `DATABASE_URL`
   manualmente. A aplicação faz o URL-encoding de usuário/senha/nome do banco
   automaticamente, então caracteres especiais na senha funcionam sem ajuste.
   - Em plano compartilhado, mantenha `DB_CONNECTION_LIMIT` **baixo** (3–5) para
     não estourar o limite de conexões da conta.
3. O schema é aplicado **automaticamente no deploy** por `npm run build`
   (`prisma migrate deploy` — só migrations pendentes, sem shadow database, sem
   `db push`/reset), usando as variáveis `DB_*` (não precisa `DATABASE_URL`). O
   bootstrap de papéis/permissões roda em seguida, de forma idempotente. Você
   **não** precisa rodar nada disso manualmente.
4. Backups: o projeto já traz utilitários em `docs/database-backups.md`
   (`npm run db:backup` etc.), que dependem dos clientes `mysqldump`/`mysql` no
   `PATH`. Em hospedagem compartilhada eles podem não estar disponíveis — nesse
   caso use os backups automáticos do próprio hPanel.

---

## 6. Uploads (armazenamento de arquivos)

Os uploads (imagens de serviços, mídia de tenant, fotos de profissionais) são
gravados em **disco local**, em diretórios **configuráveis** por variável de
ambiente, e servidos **pela própria API** (rotas dedicadas — não dependem de
mapeamento estático adicional).

- `SERVICE_IMAGE_STORAGE_DIR` (padrão: `uploads/services`)
- `TENANT_MEDIA_STORAGE_DIR` (padrão: `uploads/tenant-media`)
- `PROFESSIONAL_IMAGE_STORAGE_DIR` (padrão: `uploads/professionals`)

Aponte-os para um diretório **persistente e fora de `dist/`** (ex.:
`./storage/uploads/...` ou um caminho absoluto na sua conta), para que os
arquivos **sobrevivam a novos deploys/builds**. Garanta permissão de escrita
para o processo Node.

---

## 7. Configuração de domínio

Domínio de produção: **`https://agendei.site`** (considerando também
`https://www.agendei.site`).

1. Aponte `agendei.site` (e o `www`) para a aplicação Node no painel da
   Hostinger.
2. Ative **HTTPS/SSL** para o domínio (o hPanel emite certificado gratuito).
   HTTPS é **obrigatório**: em produção o cookie de sessão é `Secure` e
   `APP_WEB_URL`/`VITE_API_URL` devem ser `https://`.
3. Use o mesmo domínio em `VITE_API_URL` e `APP_WEB_URL`
   (`https://agendei.site`), e liste ambos em `CORS_ORIGINS`
   (`https://agendei.site,https://www.agendei.site`).
4. Base para sites públicos de tenants por subdomínio: `PUBLIC_BASE_DOMAIN=agendei.site`.
   A arquitetura já resolve, por configuração (sem hardcode), futuros
   subdomínios como `cliente.agendei.site`. Isso exige **DNS curinga**
   (`*.agendei.site`) — recurso frequentemente **não** suportado em plano
   compartilhado (ver seção 9); enquanto não houver curinga, o app funciona
   normalmente no domínio principal.

As áreas administrativas (Super Admin / administração global) **não têm link no
site comercial**; continuam acessíveis apenas por URL direta.

---

## 8. Tarefas periódicas (workers/jobs) neste ambiente

O sistema tem um **worker em processo** (`notification-worker.ts`) que, a cada
60s, dispara: lembretes de agendamento, automações de notificação, recuperação
de clientes, expiração de fidelidade, varredura comercial de assinaturas
(trial/carência/suspensão) e processamento da fila de notificações.

Esse worker **continua existindo na arquitetura** e roda embutido no processo da
API enquanto ela estiver viva. Porém, em hospedagem compartilhada a aplicação
Node pode **hibernar quando não há tráfego**, e nesse período o worker não roda.

Para esse caso, foi adicionado um **executor avulso idempotente** que roda **uma
rodada** de todas essas tarefas e encerra:

```bash
npm run worker:once
```

(equivale a `node apps/api/dist/worker/run-once.js` — as tarefas e a ordem são
exatamente as do worker contínuo; o claim atômico na fila impede processamento
duplicado caso ambos rodem).

**Configure um cron** no hPanel (**Avançado → Cron Jobs**) para chamá-lo
periodicamente. Sugestão a cada 1–5 minutos (respeite o intervalo mínimo do seu
plano):

```
*/5 * * * * cd /home/USUARIO/app && npm run worker:once >> /home/USUARIO/app/logs/worker.log 2>&1
```

Assim, mesmo com a aplicação hibernando, lembretes, automações, recuperação de
clientes e a varredura comercial de assinaturas continuam sendo processados.

---

## 9. Limitações da Hostinger compartilhada e funcionalidades afetadas

- **Worker contínuo não confiável:** sem tráfego a app pode hibernar → use o
  **cron** da seção 8. Sem o cron, notificações/automações/varredura comercial
  só rodam quando há requisições mantendo o processo vivo.
- **Processo único / sem escala horizontal:** um só processo Node. O
  processamento da fila de notificações usa claim atômico no banco, então é
  seguro, mas não há paralelismo entre instâncias.
- **PM2 não é necessário nem usado:** o painel Node da Hostinger já gerencia o
  processo (start/restart). Não configure PM2 se o plano não permitir.
- **Subdomínios curinga de tenants (`PUBLIC_BASE_DOMAIN`)** exigem DNS curinga,
  em geral indisponível em plano compartilhado — os sites públicos de tenant por
  **subdomínio** podem não funcionar. O acesso por caminho/rota da aplicação
  continua funcionando.
- **E-mail (SMTP), Web Push (VAPID) e gateways de pagamento** são opcionais: se
  as variáveis não forem configuradas, esses recursos ficam **desabilitados**,
  sem afetar o restante do sistema. Configure-os quando tiver as credenciais.
- **Uploads em disco local:** dependem de diretório persistente (seção 6); em
  planos com storage efêmero, aponte para uma pasta persistente da conta.
- **Ferramentas de backup por linha de comando** (`mysqldump`/`mysql`) podem não
  estar no `PATH` — use os backups do hPanel como alternativa.
- **Limite de conexões MySQL:** mantenha `DB_CONNECTION_LIMIT` baixo (seção 5).
- **Versão do Node:** recomendado **Node 22**; **20.19.x também funciona** (é o
  mínimo que as dependências exigem). O aviso `EBADENGINE` de `@prisma/streams-local`
  (`>=22`) é não-fatal e não afeta o build/runtime da API.
- **Ferramentas de build em `dependencies`:** TypeScript/Prisma CLI/Vite/`@types`
  de build ficam em `dependencies` (não em devDependencies), então o build
  funciona com qualquer modo de install do painel — inclusive produção.
- **Recursos de CPU/RAM restritos:** se houver erro de memória no hash de senha,
  reduza `PASSWORD_ARGON2_MEMORY_COST` (mínimo 19456).

Nenhuma dessas limitações remove funcionalidade do código: são restrições do
ambiente de hospedagem, com o cron cobrindo o ponto mais sensível (tarefas
periódicas).

---

## 10. Checklist de primeiro deploy

1. No painel Node da Hostinger, selecionar **Node 22** (recomendado) ou, se não
   houver, deixar em **20.19.x** — ambos funcionam.
2. Criar banco MySQL no hPanel e anotar host/porta/nome/usuário/senha (para as
   variáveis `DB_*` — **não** é preciso `DATABASE_URL`).
3. Enviar o código (sem `node_modules`/`.env`/`dist`).
4. Criar o `.env` de produção a partir de `.env.production.example` — com as
   `DB_*` e `VITE_API_URL` definidas **antes** do build.
5. **Build command:** `npm run build` (aplica migrations + bootstrap
   automaticamente; não rode nada por SSH).
6. **Start command:** `npm run start`.
7. Apontar `agendei.site`/`www` + ativar HTTPS.
8. Criar o Super Admin (seção 11) e o cron `npm run worker:once` (seção 8).
9. Validar: abrir o domínio (site carrega), `GET /health` responde `ok`,
   `GET /ready` responde `ready` (banco conectado), login em `/platform` funciona.

---

## 11. Primeiro acesso ao Super Admin (administração global)

O painel de administração global (Super Admin) fica em **`/platform`** —
ex.: `https://agendei.site/platform`. Ele **não** tem link no site comercial e é
**distinto** dos sites públicos de tenant (`/public/:slug`).

O schema e os papéis/permissões globais (incluindo `PLATFORM_ADMIN`) já são
aplicados automaticamente no deploy (migrations + bootstrap dentro de
`npm run build`). Falta apenas provisionar o usuário Super Admin:

1. **Provisione o Super Admin** por variáveis de ambiente **temporárias** (a
   senha é gravada só como hash; nunca em texto puro):
   - Defina no ambiente do Web App:
     - `PLATFORM_ADMIN_EMAIL=admin@agendei.site`
     - `PLATFORM_ADMIN_PASSWORD=<senha forte temporária>`
   - **Reinicie/Redeploy**. No start, o servidor cria (se não existir) o usuário
     com esse e-mail, senha (hash) e o promove a `PLATFORM_ADMIN`. É idempotente:
     se já existir, não altera a senha.
   - Confira nos **Runtime logs**: `Provisionamento do administrador da plataforma concluído`.
2. **Entre** em `https://agendei.site/platform` com o e-mail e a senha temporária.
3. **Remova `PLATFORM_ADMIN_PASSWORD`** do ambiente (e reinicie). A conta continua
   funcionando pelo hash já armazenado. Troque a senha pela área de conta quando
   possível.
