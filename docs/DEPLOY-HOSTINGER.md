# Deploy na hospedagem Node.js compartilhada da Hostinger

Guia para colocar a plataforma no ar na **hospedagem Node.js gerenciada** da
Hostinger (painel hPanel > "Node.js"), com o **mínimo de alterações** na
arquitetura. A branch `deploy/hostinger-node` só adiciona adaptações de deploy;
nenhuma regra de negócio foi alterada e nenhuma funcionalidade da `master` foi
removida.

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

No painel Node da Hostinger, configure o **Build command** (ou rode via SSH na
raiz do projeto, uma vez, após cada envio de código):

```bash
npm install && npm run build:deploy
```

- `npm install` — instala dependências de todos os workspaces.
- `npm run build:deploy` — roda `prisma generate` e compila **shared → api →
  web** (`packages/shared`, `apps/api` → `apps/api/dist`, `apps/web` →
  `apps/web/dist`).

> ⚠️ O build do frontend precisa da variável `VITE_API_URL` já definida no
> ambiente **no momento do build** (ela é embutida no bundle). Garanta que o
> `.env` de produção já exista antes de buildar o web. Veja a seção 4.

Migrações do banco (rode após o build, sempre que houver migrações novas):

```bash
npm run db:migrate
```

Primeiro deploy — criar o administrador da plataforma (Super Admin) e/ou dados
iniciais, se aplicável ao seu fluxo:

```bash
npm run db:bootstrap --workspace=@plataforma/api        # se o projeto usar seed
npm run platform-admin:create --workspace=@plataforma/api
```

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
| `DATABASE_URL` | `mysql://user:senha@host:3306/banco?connection_limit=5` | ver seção 5. |
| `CORS_ORIGINS` | `https://app.seudominio.com` | seu domínio público; nunca `*`. |
| `VITE_API_URL` | `https://app.seudominio.com` | mesmo domínio (single-origin); embutida no build do web. |
| `APP_WEB_URL` | `https://app.seudominio.com` | usada em links de e-mail; deve ser HTTPS. |
| `WEB_DIST_DIR` | `./apps/web/dist` | faz a API servir o frontend + fallback SPA. |
| `AUTH_COOKIE_SECURE` | `true` | obrigatório em produção. |
| `LOG_LEVEL` | `info` | |

Porta/host: **não** defina `API_PORT` — a Hostinger fornece `PORT`. `API_HOST`
assume `0.0.0.0`.

Uploads (recomendado apontar para diretório persistente — seção 6):
`SERVICE_IMAGE_STORAGE_DIR`, `TENANT_MEDIA_STORAGE_DIR`,
`PROFESSIONAL_IMAGE_STORAGE_DIR`.

Opcionais (só se for usar; podem ficar em branco): `SMTP_*` (e-mail
transacional), `VAPID_*` (web push), `PAYMENT_GATEWAY_ENCRYPTION_KEY` (gateways
de pagamento), `PUBLIC_BASE_DOMAIN` (sites de tenant por subdomínio).

O restante (Argon2, rate limit, TTLs) tem padrões seguros — só ajuste se
necessário. A lista completa comentada está em `.env.production.example`.

---

## 5. Configuração do MySQL

1. No hPanel: **Bancos de dados MySQL** → crie um banco e um usuário, anote
   host, porta, nome do banco, usuário e senha.
2. Monte a `DATABASE_URL`:
   `mysql://USUARIO:SENHA@HOST:PORTA/NOME_DO_BANCO?connection_limit=5`
   - Em plano compartilhado, mantenha `connection_limit` **baixo** (3–5) para
     não estourar o limite de conexões da conta.
   - Se a senha tiver caracteres especiais, faça URL-encode deles.
3. Aplique o schema com as migrações (não use `db push` em produção):
   ```bash
   npm run db:migrate
   ```
   Isso roda `prisma migrate deploy` (aplica as migrações versionadas do
   projeto, sem shadow database — compatível com usuários MySQL sem permissão
   para criar bancos temporários).
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

1. Aponte seu domínio/subdomínio (ex.: `app.seudominio.com`) para a aplicação
   Node no painel da Hostinger.
2. Ative **HTTPS/SSL** para esse domínio (o hPanel emite certificado gratuito).
   HTTPS é **obrigatório**: em produção o cookie de sessão é `Secure` e
   `APP_WEB_URL`/`VITE_API_URL` devem ser `https://`.
3. Use **o mesmo domínio** em `CORS_ORIGINS`, `VITE_API_URL` e `APP_WEB_URL`.
4. Sites públicos de tenants por subdomínio (`PUBLIC_BASE_DOMAIN`) exigem
   DNS curinga (`*.sites.seudominio.com`) — recurso frequentemente **não**
   suportado em plano compartilhado (ver seção 9).

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
- **Limite de conexões MySQL:** mantenha `connection_limit` baixo (seção 5).
- **Recursos de CPU/RAM restritos:** se houver erro de memória no hash de senha,
  reduza `PASSWORD_ARGON2_MEMORY_COST` (mínimo 19456).

Nenhuma dessas limitações remove funcionalidade do código: são restrições do
ambiente de hospedagem, com o cron cobrindo o ponto mais sensível (tarefas
periódicas).

---

## 10. Checklist de primeiro deploy

1. Criar banco MySQL no hPanel e montar `DATABASE_URL`.
2. Enviar o código (sem `node_modules`/`.env`/`dist`).
3. Criar o `.env` de produção a partir de `.env.production.example` (incluindo
   `VITE_API_URL` **antes** do build).
4. `npm install && npm run build:deploy`.
5. `npm run db:migrate` (e, no 1º deploy, criar o Super Admin).
6. Definir start: `npm run start`; garantir `WEB_DIST_DIR=./apps/web/dist`.
7. Apontar domínio + ativar HTTPS.
8. Criar o cron `npm run worker:once` (seção 8).
9. Validar: abrir o domínio (site carrega), `GET /health` responde `ok`,
   `GET /ready` responde `ready` (banco conectado), login funciona.
