# Plataforma de Serviços

Fundação técnica de uma aplicação web multiempresa para gestão de serviços. Esta etapa acrescenta
identidades globais, sessões persistentes, recuperação de senha, convites, associação de usuários a
empresas e autorização por papéis e permissões, preservando o isolamento multiempresa.

## Requisitos

- Node.js 20.20 ou superior
- npm 10.8 ou superior
- MySQL 8.0 ou 8.4

## Stack

- React 19, TypeScript, Vite, React Router, TanStack Query e React Hook Form
- Node.js, Fastify, Zod, Pino, cookies Fastify e rate limit Fastify
- Prisma ORM, MySQL 8 e Argon2id
- ESLint, Prettier e Vitest
- npm workspaces

## Instalação e ambiente

```bash
npm install
```

Copie `.env.example` para `.env` e substitua as credenciais e URLs locais.

| Variável                     | Finalidade                                        |
| ---------------------------- | ------------------------------------------------- |
| `NODE_ENV`                   | Ambiente: `development`, `test` ou `production`   |
| `API_HOST` / `API_PORT`      | Interface e porta da API                          |
| `DATABASE_URL`               | Conexão MySQL usada pelo Prisma                   |
| `CORS_ORIGINS`               | Origens web autorizadas, separadas por vírgula    |
| `LOG_LEVEL`                  | Nível dos logs estruturados                       |
| `VITE_API_URL`               | URL da API usada pelo navegador                   |
| `APP_WEB_URL`                | URL base usada nos links de recuperação e convite |
| `AUTH_COOKIE_NAME`           | Nome do cookie opaco de sessão                    |
| `AUTH_SESSION_TTL_HOURS`     | Duração máxima da sessão                          |
| `AUTH_MAX_ACTIVE_SESSIONS`   | Limite de sessões ativas por usuário              |
| `AUTH_COOKIE_SECURE`         | Exige HTTPS para transmitir o cookie              |
| `PASSWORD_ARGON2_*`          | Parâmetros de custo do Argon2id                   |
| `LOGIN_RATE_LIMIT_*`         | Limite e janela das tentativas de login           |
| `PASSWORD_RESET_TTL_MINUTES` | Validade do link de redefinição                   |
| `INVITATION_TTL_HOURS`       | Validade do convite                               |

Todas as variáveis são validadas na inicialização. Em produção, o cookie seguro e URLs HTTPS são
obrigatórios. Valores sensíveis não aparecem nas mensagens de validação nem nos logs.

## Preparação do banco

```bash
npm run db:generate
npm run db:migrate
npm run db:bootstrap
```

`db:bootstrap` é idempotente e cadastra os papéis estruturais, permissões e seus vínculos. Pode ser
executado novamente após uma implantação sem duplicar dados. Assim como a API, o comando valida o
ambiente completo; carregue o `.env` antes de executá-lo.

Para criar uma migration durante o desenvolvimento:

```bash
npm run db:migrate:dev -- --name descricao_da_alteracao
```

## Execução local

```bash
npm run dev
```

O frontend usa a porta padrão `5173`. A API usa `API_HOST` e `API_PORT`.

Em desenvolvimento e teste, `POST /internal/tenants` cria atomicamente uma empresa, configurações,
matriz, usuário proprietário e associação `OWNER`. A rota não existe em produção e nunca retorna a
senha nem seu hash.

## Identidade, sessão e empresa ativa

- `User` é uma identidade global, com e-mail normalizado e único.
- `TenantMembership` associa o usuário a uma empresa e a um papel global.
- A mesma identidade pode participar de várias empresas com papéis diferentes.
- O login cria um token aleatório opaco. Somente seu hash é persistido em `UserSession`.
- O navegador recebe a credencial apenas em cookie `HttpOnly`, `SameSite=Lax` e, em produção,
  `Secure`. O frontend não armazena token, papel ou permissões.
- Depois do login, o usuário escolhe uma das empresas ativas retornadas por `/auth/me`.
- O navegador envia o `publicId` escolhido em `X-Tenant-Id`; a API sempre confirma a associação e os
  estados do usuário, associação e empresa antes de autorizar a requisição.
- A escolha da empresa fica apenas em `sessionStorage` e não é uma credencial.
- Logout revoga a sessão atual; logout global revoga todas as sessões do usuário.
- A área autenticada lista somente sessões ainda válidas e permite revogar uma sessão ou todas.
- Alteração de senha e aceite de convite invalidam tokens de uso único de forma transacional.

## Papéis e permissões

Os papéis iniciais são `OWNER`, `MANAGER`, `RECEPTIONIST` e `PROFESSIONAL`. As permissões são
registros independentes ligados aos papéis por `RolePermission`; a autorização usa a permissão
necessária para cada operação, não comparações espalhadas com nomes de papéis.

O bootstrap inclui permissões para visualizar empresa, unidades e configurações, além de visualizar
e administrar membros e convites. A estrutura aceita novos papéis e permissões sem alterar o modelo
de sessão.

## Endpoints

### Técnicos e provisionamento local

| Método | Caminho             | Autenticação | Finalidade                                         |
| ------ | ------------------- | ------------ | -------------------------------------------------- |
| `GET`  | `/health`           | Não          | Confirma que o processo está ativo                 |
| `GET`  | `/ready`            | Não          | Confirma a conexão com o MySQL                     |
| `POST` | `/internal/tenants` | Não          | Provisiona empresa e proprietário fora de produção |

### Autenticação e conta

| Método   | Caminho                           | Autenticação | Finalidade                                       |
| -------- | --------------------------------- | ------------ | ------------------------------------------------ |
| `POST`   | `/auth/login`                     | Não          | Valida credenciais e cria uma sessão             |
| `POST`   | `/auth/logout`                    | Opcional     | Revoga a sessão atual e limpa o cookie           |
| `POST`   | `/auth/logout-all`                | Sim          | Revoga todas as sessões do usuário               |
| `GET`    | `/auth/me`                        | Sim          | Retorna identidade e empresas acessíveis         |
| `GET`    | `/auth/sessions`                  | Sim          | Lista sessões ativas sem revelar tokens          |
| `DELETE` | `/auth/sessions/:sessionPublicId` | Sim          | Revoga uma sessão do próprio usuário             |
| `POST`   | `/auth/password/forgot`           | Não          | Solicita recuperação com resposta não enumerável |
| `POST`   | `/auth/password/reset`            | Não          | Redefine senha com token de uso único            |
| `POST`   | `/auth/invitations/accept`        | Não          | Aceita convite e cria ou vincula a identidade    |

### Empresa ativa

Estas rotas exigem cookie válido, `X-Tenant-Id`, associação ativa e a permissão correspondente.

| Método   | Caminho                                           | Finalidade                               |
| -------- | ------------------------------------------------- | ---------------------------------------- |
| `GET`    | `/tenant/context`                                 | Retorna o contexto público da empresa    |
| `GET`    | `/tenant/units`                                   | Lista unidades da empresa ativa          |
| `GET`    | `/tenant/settings`                                | Retorna configurações da empresa ativa   |
| `GET`    | `/tenant/members`                                 | Lista membros da empresa ativa           |
| `PATCH`  | `/tenant/members/:membershipPublicId`             | Altera papel ou estado de uma associação |
| `POST`   | `/tenant/members/invitations`                     | Cria e entrega um convite                |
| `DELETE` | `/tenant/members/invitations/:invitationPublicId` | Cancela convite pendente                 |

## Recuperação e entrega de mensagens

Os fluxos persistem somente hashes dos tokens. A resposta de recuperação é sempre genérica, exista
ou não uma conta, reduzindo enumeração de usuários. O serviço de entrega é uma fronteira explícita.
A execução normal usa um adaptador não configurado até que um provedor real seja conectado; nesse
estado, a criação de convites é recusada antes da persistência. Se um provedor configurado falhar
após a criação, o convite pendente é revogado para permitir nova tentativa. Os testes injetam
explicitamente um adaptador local que captura as mensagens sem enviá-las.

## Controles de segurança

- Senhas processadas com Argon2id e política compartilhada entre API e interface.
- Tokens de sessão, recuperação e convite gerados com fonte criptográfica e persistidos como hash.
- Comparação de credenciais sem atalho evidente para contas inexistentes.
- Rate limit no login por combinação de IP e e-mail normalizado; demais fluxos sensíveis são
  limitados por IP.
- Limite de sessões simultâneas, expiração e revogação explícita.
- CORS restrito com credenciais e proteção de mutações autenticadas por `Origin`/`Referer` em
  produção.
- Cookie `HttpOnly`, `SameSite=Lax`, caminho raiz e `Secure` obrigatório em produção.
- Redação de cookies, autorização, senhas e tokens nos logs.
- Auditoria persistente para login, logout, recuperação, convite e administração de membros.
- IDs internos sequenciais nunca fazem parte do contrato HTTP.
- Chaves estrangeiras restritivas e operações críticas transacionais.

Para uma implantação com várias instâncias, configure um armazenamento distribuído para rate limit.
Use HTTPS de ponta a ponta, um provedor de e-mail transacional, rotação de segredos, monitoramento e
políticas de retenção dos registros de auditoria.

## Qualidade e build

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test
npm run build
```

Os testes rápidos da API usam repositórios controlados em memória e não substituem MySQL por SQLite.
Eles cobrem contratos, hashes de senha, autenticação, sessões, recuperação, convites, RBAC,
isolamento multiempresa, proteção CSRF, rate limit, auditoria e conteúdo das migrations. A suíte
também contém um teste integrado com MySQL real, habilitado ao definir
`MYSQL_INTEGRATION_DATABASE_URL`; use uma base exclusiva e descartável para esse teste. As migrations
devem ser aplicadas contra uma instância MySQL real antes de cada implantação.

O frontend compilado fica em `apps/web/dist`. O backend compilado fica em `apps/api/dist` e pode ser
iniciado com:

```bash
npm run start --workspace=@plataforma/api
```

## Estrutura

```text
apps/
  api/       API Fastify, Prisma, autenticação, RBAC, contexto multiempresa e testes
  web/       Aplicação React, formulários de acesso e seleção de empresa
packages/
  config/    Configurações TypeScript compartilhadas
  shared/    Schemas, tipos e contratos HTTP compartilhados
```
