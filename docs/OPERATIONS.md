# Operação e manutenção

Este runbook complementa o [guia de deploy](DEPLOY-HOSTINGER.md) e os
[backups do banco](database-backups.md). Ele descreve a operação segura da
plataforma; não substitui o procedimento de incidentes do provedor.

## Rotina de verificação

- `GET /health`: processo HTTP ativo.
- `GET /ready`: processo e banco prontos para receber tráfego. Configure o
  monitor externo para alertar quando deixar de responder `200`.
- `GET /metrics`: métricas Prometheus do processo atual. Consulte respostas
  `5xx`, requisições lentas, requisições em voo e uptime.
- Logs: pesquise por `Alerta operacional`, `Falha interna na requisição` e
  `Banco de dados indisponível`. Os logs possuem `requestId`; use-o para
  correlacionar uma ocorrência sem registrar senhas, tokens ou dados pessoais.

## Tarefas recorrentes

Em hospedagem compartilhada, configure o cron descrito no guia de deploy para
executar `npm run worker:once` a cada 1–5 minutos. Ele é idempotente e mantém
lembretes, automações, recuperação de clientes e filas de notificação mesmo
quando o processo web estiver hibernado.

## Deploy e rollback

1. Faça deploy somente de um commit validado.
2. O build de produção executa Prisma generate, recuperação segura de migration,
   `migrate deploy`, bootstrap idempotente e compilação. Ele nunca executa
   `prisma migrate reset`.
3. Após o deploy, confirme `/health`, `/ready`, a home e um login autorizado.
4. Para reverter código, publique o commit anterior compatível. Não reverta ou
   apague migrations já aplicadas; use apenas migrations corretivas aditivas.

## Incidentes

**Aplicação indisponível:** confirme `/health`, verifique os logs de start e a
configuração de `PORT`. Se `/health` responde e `/ready` falha, trate como
incidente de banco/conexão.

**Banco indisponível:** valide host, porta, usuário, senha, limite de conexões
e disponibilidade no hPanel. Não use `db push`, `migrate dev` ou reset em
produção. O deploy volta a aplicar migrations pendentes automaticamente.

**Fila ou lembretes atrasados:** confirme o cron e execute uma rodada manual
somente em ambiente autorizado com `npm run worker:once`; revise os logs de
notificação e o status dos provedores configurados.

**Erro de migration:** preserve o erro e o estado do banco. A recuperação do
pipeline só marca migrations falhas como revertidas para reaplicar o SQL
versionado; se a falha persistir, interrompa novos deploys e investigue antes
de qualquer ação manual.

## Backups e restauração

Siga [database-backups.md](database-backups.md). Teste restaurações em banco
isolado; restauração em produção requer confirmação explícita, um backup
validado e uma janela de manutenção. Nunca apague backups antes de confirmar
uma restauração utilizável.

## Manutenção preventiva

- Revise erros 5xx e latência periodicamente.
- Mantenha Node, dependências e credenciais dentro de janelas de manutenção.
- Preserve `PAYMENT_GATEWAY_ENCRYPTION_KEY`, VAPID e demais chaves estáveis:
  trocá-las pode inutilizar dados cifrados ou inscrições existentes.
- Remova `PLATFORM_ADMIN_PASSWORD` do ambiente após o primeiro provisionamento.
- Não versione `.env`, dumps, uploads de clientes nem logs de produção.
