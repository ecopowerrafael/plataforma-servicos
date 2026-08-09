# Arquitetura do Projeto

## Stack

Monorepo npm workspaces:

- apps/api — Fastify + TypeScript
- apps/web — React + Vite
- packages/shared — contratos e tipos compartilhados
- Prisma
- MySQL

## Padrão backend

Toda funcionalidade persistente deve seguir, quando aplicável:

Frontend
→ contrato compartilhado
→ rota Fastify
→ autenticação/permissão
→ contexto do tenant
→ service
→ repository
→ Prisma
→ MySQL
→ auditoria

Reutilizar módulos existentes antes de criar novas estruturas.

## Multiempresa

Operações do estabelecimento devem:

- exigir sessão;
- usar X-Tenant-Id;
- validar membership;
- validar permissão;
- obter tenantId interno no backend;
- impedir acesso entre tenants;
- expor somente IDs públicos.

Nunca confiar em tenantId recebido no payload.

## Frontend

Utilizar:

- React;
- TanStack Query;
- React Hook Form;
- Zod;
- componentes existentes.

Não usar:

- dados mockados;
- arrays locais como persistência;
- localStorage como banco;
- endpoints simulados;
- formulários sem integração real.

## Banco

- MySQL é o banco oficial.
- Prisma é o ORM.
- Toda mudança estrutural exige nova migration.
- Nunca alterar migration já aplicada.
- Nunca usar prisma db push.
- Nunca resetar banco para resolver migration.

## Uploads

Reutilizar infraestrutura existente.

Validar:

- MIME real;
- extensão;
- tamanho;
- dimensões;
- isolamento por tenant.

Não armazenar imagens em base64 no banco.

## Segurança

- respeitar RBAC existente;
- não expor IDs internos;
- não expor credenciais;
- não remover validações;
- não usar any para contornar TypeScript;
- registrar auditoria nas operações relevantes.

## Regra principal

Este é um projeto existente e avançado.

Não reconstruir módulos concluídos.
Não criar arquitetura paralela.
Não substituir tecnologias existentes.
Antes de implementar, consultar somente os arquivos diretamente relacionados à funcionalidade atual.
