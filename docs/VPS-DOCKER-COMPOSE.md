# VPS — perfil Docker Compose

Este é o perfil VPS principal. O perfil Hostinger (`docs/DEPLOY-HOSTINGER.md`)
permanece separado e não é alterado por este documento.

## Princípios

- Node 22 e MySQL 8.
- Docker Compose é o único orquestrador VPS desta etapa.
- Caddy termina TLS e encaminha para a API.
- Volumes persistentes mantêm MySQL, uploads e estado do Caddy.
- A API inicia os workers configurados e trata `SIGTERM` para encerramento gracioso.
- Nenhum segredo é versionado; copie `vps.env.example` para `vps.env` no servidor.

## Fases

`deploy/vps/Dockerfile` executa somente geração do Prisma e compilação. Não executa
migration, bootstrap, `db push` ou reset. A Fase B é operacional e deve ser
executada separadamente com backup, guard, status, migration incremental,
bootstrap, verify, restart e smoke tests.

```text
Fase A: npm ci → npm run build:phase-a → testes/typecheck → imagem
Fase B: backup → guard → status V2 → migration → bootstrap → verify → restart
```

## Primeira instalação

1. Instale Docker Engine/Compose, configure firewall para 22/80/443 e crie um
   usuário sem privilégio root.
2. Copie `vps.env.example` para `vps.env`, substitua todos os placeholders e
   mantenha o arquivo fora do Git.
3. Execute `deploy/vps/deploy.sh` para compilar e iniciar a stack.
4. Antes de qualquer migration, faça o backup com `deploy/vps/backup.sh` e
   execute os guards V2 a partir de um ambiente administrativo controlado.
5. Registre o resultado de `db:status:v2`, `db:verify`, health e ready.

## Atualização e rollback

Construa uma nova imagem, valide a Fase A e só então execute a Fase B com o
backup correspondente. Em falha da aplicação, defina `VPS_IMAGE_TAG` para a
imagem anterior e execute `deploy/vps/rollback.sh`. Rollback de banco é separado:
restauração só ocorre após parar a escrita, validar o dump em clone local e obter
autorização explícita.

## Banco

O provider Prisma continua MySQL. MySQL 8 é o alvo da VPS; MariaDB 11.8 da
Hostinger permanece uma plataforma de transição validada separadamente. Nenhum
script VPS usa Hostinger, `lsnode` ou `hbuilds/current`.
