# Prospecting Platform — Guia de Ativação em Produção

## 1. Defaults de Segurança

**Nunca altere em código:**

```bash
PROSPECTING_WORKER_ENABLED=false       # Sempre false por padrão
PROSPECTING_DRY_RUN=true               # Sempre true por padrão
```

Esses defaults previnem envios acidentais em produção.

## 2. Variáveis de Ambiente Obrigatórias

```bash
# W-API
PROSPECTING_WHATSAPP_INSTANCE_ID=sua_instancia
PROSPECTING_WHATSAPP_API_TOKEN=seu_token     # Write-only. Nunca logar.

# Worker (opcional)
PROSPECTING_WORKER_ENABLED=false              # Ativar DEPOIS de validação
PROSPECTING_DRY_RUN=true                      # Manter true até validação
PROSPECTING_WORKER_INTERVAL_MS=5000           # 5s entre ciclos
PROSPECTING_WORKER_BATCH_SIZE=10              # 10 leads/ciclo

# Database
DATABASE_URL=postgresql://user:pass@host/db
```

## 3. Fluxo de Ativação Controlada

### Fase 1: Deploy e Configuração (DRY_RUN=true, WORKER=false)

```
1. Deploy novo código
2. Rodar migrations: prisma migrate deploy
3. Rodar bootstrap: npm run db:bootstrap
4. Configurar W-API via POST /platform/prospecting/settings
5. Testar conexão: POST /platform/prospecting/whatsapp/test
6. Manter WORKER=false
7. Manter DRY_RUN=true
```

**Checklist:**
- [ ] Deploy bem-sucedido
- [ ] Migrations rodaram
- [ ] Bootstrap rodou
- [ ] W-API configurada
- [ ] Conexão testada ✅

### Fase 2: Teste de Campanha (DRY_RUN=true, WORKER=false)

```
Recomendações iniciais:
- 1 campanha
- 5-10 leads
- dailyLimit=1 (1 mensagem/dia)
- horário comercial
- intervalo mínimo entre mensagens
```

**Fluxo manual de teste:**

```
A. Campanha envia primeira mensagem (via webhook/scheduled)
B. W-API retorna externalMessageId
C. Status é SENT (DRY_RUN não bloqueia persistência, apenas envio real)
D. Simular resposta inbound via webhook
E. Inbound persistido em ProspectingMessage
F. ObjectionEngine classifica resposta
G. AutoReply agendada (se aplicável)
H. Validar que nenhuma mensagem real foi enviada (DRY_RUN ativo)
```

**Endpoints para teste:**
- GET /platform/prospecting/stats (validar counts)
- GET /platform/prospecting/conversations (validar inbounds)
- POST /platform/prospecting/leads/:id/messages (teste manual)

**Checklist:**
- [ ] Campanha criada com poucos leads
- [ ] Webhook funciona (inbound recebido)
- [ ] Classification funcionou
- [ ] Auto-reply agendada (se aplicável)
- [ ] Status não "real" (DRY_RUN confirmado nos logs)

### Fase 3: Worker em Simulação (DRY_RUN=true, WORKER=true)

```
1. Configurar PROSPECTING_WORKER_ENABLED=true
2. Manter PROSPECTING_DRY_RUN=true
3. Aguardar 2-3 ciclos do worker
4. Verificar GET /platform/prospecting/health
5. Monitorar fila: nenhuma mensagem deve sair em DRY_RUN
```

**Checklist:**
- [ ] Worker rodando sem erros
- [ ] Fila processando (PENDING → ~SENT)
- [ ] Nenhuma mensagem real enviada (DRY_RUN ativo)

### Fase 4: Ativação Real (DRY_RUN=false, WORKER=true)

```
⚠️  PONTO DE NÃO-RETORNO

1. Backup database completo
2. Definir PROSPECTING_DRY_RUN=false
3. Deploy com novo env
4. Aguardar 5min de observação
5. Monitorar:
   - /platform/prospecting/health (fila)
   - /platform/prospecting/campaigns-metrics (taxa de envio)
   - Logs de erro
```

**Durante fase real:**
- Monitorar leads NEEDS_REVIEW (fixar mensagens antigas antes de continuar)
- Monitorar DELIVERY_UNCERTAIN (exigir revisão manual)
- Monitorar taxa de opt-out (se sobe > 5%, pausar campanha)

## 4. Rollback Seguro

Se encontrar problemas **críticos** (ex: envios duplicados):

```bash
1. PROSPECTING_WORKER_ENABLED=false (pausar worker)
2. PROSPECTING_DRY_RUN=true (retornar simulação)
3. Deploy e reiniciar
4. Investigar causa
5. Rodar audit de mensagens duplicadas
```

Dados não são perdidos. Apenas a execução é pausada.

## 5. Webhooks e URLs

Webhook inbound URL (configurar em W-API):

```
POST https://seu-dominio.com/webhook/prospecting
```

Validar com teste simple:
```bash
curl -X POST https://seu-dominio.com/webhook/prospecting \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

## 6. Monitoramento Operacional

**Dashboard operacional endpoints:**

```
GET  /platform/prospecting/settings        → W-API + Worker status
GET  /platform/prospecting/health          → Fila + Leads NEEDS_REVIEW
GET  /platform/prospecting/funnel          → Funil de conversão
GET  /platform/prospecting/campaigns-metrics → Métricas por campanha
GET  /platform/prospecting/objections-report → Objeções mais comuns
GET  /platform/prospecting/suppression-report → Taxa de opt-out
```

**Alertas recomendados:**

- SENDING > 20 (mensagens travadas)
- DELIVERY_UNCERTAIN > 5 (validar webhook)
- NEEDS_REVIEW > 10 (revisar automação)
- Opt-out rate > 5% (qualidade da campanha)

## 7. Troubleshooting

### "Webhooks não recebem"
```
1. Verificar URL configurada em W-API
2. Validar firewall/NAT
3. POST /platform/prospecting/whatsapp/test
4. Ler logs de webhook
```

### "Worker não processa"
```
1. Confirmar PROSPECTING_WORKER_ENABLED=true
2. Verificar database connectivity
3. Verificar logs de erro do worker
4. Rodar 1 ciclo manual: POST /platform/prospecting/worker/run-once
```

### "Taxa de entrega baixa"
```
1. Verificar W-API status
2. Revisar leads NEEDS_REVIEW (automação trava)
3. Revisar opt-out rate (qualidade)
4. Checar intervalos entre mensagens (rate limit)
```

## 8. Segurança

**O que NÃO fazer em produção:**

- ❌ Expor tokens de W-API em logs/UI
- ❌ Invertir defaults de WORKER_ENABLED ou DRY_RUN em código
- ❌ Permitir UI alterar environment vars
- ❌ Enviar mensagens antes de testar webhook
- ❌ Rodar worker sem monitorar fila

**O que FAZER:**

- ✅ Manter DRY_RUN=true durante testes
- ✅ Testar webhook antes de WORKER=true
- ✅ Monitorar health endpoint regularmente
- ✅ Revisar NEEDS_REVIEW antes de auto-reply
- ✅ Backup antes de DRY_RUN=false
- ✅ Token é write-only (UI mostra "Configurado")

## 9. Permissions Necessárias

Platform Admin deve ter:

```
platform.prospecting.read    → Ler stats, health, métricas
platform.prospecting.update  → Criar/editar campanhas, templates, settings
platform.worker.execute      → Rodar worker manualmente (opcional)
```

TenantMembership NÃO recebe automaticamente.

## 10. Primeiro Teste Real — Checklist

- [ ] Campanha com 5-10 leads
- [ ] dailyLimit=1
- [ ] Webhook funciona (inbound testado)
- [ ] Classification funciona (manual messages podem testar)
- [ ] DRY_RUN=true confirmado em logs
- [ ] Worker rodando sem erros
- [ ] Health endpoint mostra fila processando
- [ ] Depois: backup → DRY_RUN=false → monitorar
- [ ] Após 30min: revisar NEEDS_REVIEW e opt-outs
- [ ] Após 1h: expandir para 2-3 campanhas

**Sucesso:** Mensagens saem, inbounds entram, automação responde.
