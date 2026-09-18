# Auditoria dos testes históricos de prospecção

Execução local após o bootstrap sistêmico: 42 testes, 25 aprovados e 17 falhos.
As falhas abaixo são classificadas sem alterar contratos de produção para
acomodar expectativas antigas.

| Teste | Falha | Classificação | Correção necessária |
|---|---|---|---|
| Phase A 1–4 | fluxo padrão ausente no estado testado | FRESH_BOOTSTRAP_MISSING | executar `db:bootstrap:system` antes da suíte |
| Phase A 16 | fixture usa `contactTemplate` removido | LEGACY_API_EXPECTATION | criar campanha com DTO atual |
| Phase A 17 | fixture usa `contactTemplate` removido | LEGACY_API_EXPECTATION | criar campanha com DTO atual |
| Phase A 19 | fixture/ID de step incompatível | FIXTURE_INCOMPLETE | recuperar ID interno por `publicId` |
| Phase A 20 | fixture de `WAIT_LINK` incompleta | FIXTURE_INCOMPLETE | preencher relação conforme schema atual |
| Real Pipeline A | chamada antiga de `createOption` | LEGACY_API_EXPECTATION | usar `createOption({ stepId, label, ... })` |
| Real Pipeline B | chamada antiga de `createOption` | LEGACY_API_EXPECTATION | usar assinatura atual |
| Real Pipeline C | chamada antiga de `createOption` | LEGACY_API_EXPECTATION | usar assinatura atual |
| Real Pipeline F | fixture outbound incompleta | FIXTURE_INCOMPLETE | criar campanha/mensagem pelas APIs atuais |
| Real Pipeline H | chamada antiga de `createOption` | LEGACY_API_EXPECTATION | usar assinatura atual |
| Real Pipeline I | chamada antiga de `createOption` | LEGACY_API_EXPECTATION | usar assinatura atual |
| Real Pipeline J | campanha referenciada não criada | FIXTURE_INCOMPLETE | criar campanhas antes das mensagens |
| Regression L | chamada antiga de `createOption` | LEGACY_API_EXPECTATION | usar assinatura atual |
| Event-Type 1 | chamada antiga de `createOption` | LEGACY_API_EXPECTATION | usar assinatura atual |
| Testes externos não presentes neste relatório | dependência de serviço externo | EXTERNAL_DEPENDENCY | separar e exigir configuração/timeout |
| Suíte global | workers/timers de integração | TEST_RUNNER_PROBLEM | teardown e timeout explícitos |
| Testes W-API/Meta reais | provedores não configurados | EXTERNAL_DEPENDENCY | usar mocks ou suite externa separada |

Nenhuma falha foi classificada como `REAL_SERVICE_REGRESSION` com a evidência
disponível. Os casos de Stripe, Mercado Pago, SMTP, push e HTTP externo devem
ser executados apenas na suite externa com credenciais e endpoints de teste.
