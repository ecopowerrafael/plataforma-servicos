# Stripe Billing (Agendei)

O backend usa o SDK oficial `stripe`. Stripe é o único gateway que cria e mantém uma Subscription recorrente; PIX
local, Mercado Pago e carteira comercial continuam no fluxo comum de cobrança/confirmação, sem criar Subscription Stripe.

## Fluxo auditado

- A primeira `TenantSubscription` nasce em `PlatformService`/`AuthRoutes`, inicialmente `TRIALING` ou `PAST_DUE`.
- `PlanBillingOption` é escolhido por `planId + billingCycle`; o Price recorrente canônico é o registro `StripePlanPrice`
  do `StripePlanCatalog` no ambiente ativo. O resolver também consulta o Price remoto e valida produto, moeda, valor,
  status e recorrência.
- A contratação inicial chama `createInitialSubscriptionCheckout()` e usa `mode=subscription` com `line_items[].price`.
  Ela não passa por `checkoutChange()`.
- Alterações imediatas usam `previewStripeUpgrade()`/`applyStripeUpgrade()` ou, no caminho legado de ajuste avulso,
  `createOneTimeUpgradeAdjustmentCheckout()` (`mode=payment`, `price_data` apenas para a diferença, metadata
  `UPGRADE_ADJUSTMENT`). Downgrades e periodicidade são registrados para o fim do período e agendados no Stripe.
- `amountDueCents` continua sendo o cálculo local de crédito para gateways manuais e para o ajuste avulso legado;
  o upgrade Stripe preferencial usa `invoices.createPreview()` e `always_invoice`.
- A confirmação não é feita pela tela de sucesso: `checkout.session.completed`/`invoice.paid` e os eventos de assinatura
  reconciliam IDs e períodos reais. `invoice.paid` ativa ou renova; `invoice.payment_failed` marca `PAST_DUE`;
  `customer.subscription.deleted` cancela; `charge.refunded` suspende e encerra o entitlement.
- O trial termina quando o primeiro `invoice.paid` chega, iniciando o primeiro período pago com as datas informadas pelo Stripe.

IDs Stripe persistidos: `TenantSubscription.stripeCustomerId`, `stripeSubscriptionId` e `stripePriceId`;
`SubscriptionPlanChange` também mantém referências do checkout, pagamento e alteração.

## Variáveis

- `STRIPE_SECRET_KEY`: `sk_test_...`, somente no backend.
- `STRIPE_WEBHOOK_SECRET`: segredo do endpoint `/webhooks/stripe`.
- `STRIPE_PRODUCT_ID`: produto único usado para os Prices administrados pelo painel.

## Rotas

- `POST /tenant/billing/stripe/checkout` — contratação inicial `{ "planPublicId": "...", "billingCycle": "MONTHLY" }`
  ou ajuste `{ "changePublicId": "..." }`; autenticada e somente proprietário.
- `POST /tenant/billing/stripe/upgrade-preview` e `/upgrade-apply` — preview/aplicação explícitos do upgrade com prorrateio Stripe.
- `POST /tenant/billing/stripe/portal` — autenticada, exige `X-Tenant-Id`; retorna a URL temporária do Customer Portal.
- `POST /tenant/billing/stripe/cancel` — autenticada e somente proprietário; agenda cancelamento no fim do período.
- `POST /tenant/billing/stripe/uncancel` — desfaz o cancelamento antes do vencimento.
- `POST /webhooks/stripe` — pública, sem sessão; exige `Stripe-Signature` e raw body.

Cadastre no Stripe Dashboard, no ambiente correspondente, os eventos `checkout.session.completed`,
`customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`,
`invoice.payment_failed` e `charge.refunded`.

No deploy documentado do projeto, o webhook deve apontar para `https://agendei.site/webhooks/stripe` (ou para o domínio público efetivamente configurado). O processo Hostinger precisa expor HTTPS, executar `npm run build` e aplicar `npm run db:migrate:deploy` antes do restart. A migration é backward-compatible.

Os eventos são gravados em `stripe_webhook_events` com `external_event_id` único; eventos processando ou processados não
são executados em paralelo. A assinatura é validada, o ambiente/livemode é conferido e eventos antigos não retrocedem
o estado. A alteração de preço cria um novo Price por meio de `syncCatalog`; assinaturas existentes mantêm o Price original
até uma mudança explícita ou agendada.
