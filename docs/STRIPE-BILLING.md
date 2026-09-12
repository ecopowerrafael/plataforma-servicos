# Stripe Billing (Agendei)

O backend usa o SDK oficial `stripe` em modo TEST. PIX Manual e Mercado Pago continuam no módulo de pagamentos avulsos.

## Variáveis

- `STRIPE_SECRET_KEY`: `sk_test_...`, somente no backend.
- `STRIPE_WEBHOOK_SECRET`: segredo do endpoint `/webhooks/stripe`.
- `STRIPE_PRODUCT_ID`: produto único usado para os Prices administrados pelo painel.

## Rotas

- `POST /tenant/billing/stripe/checkout` — autenticada, exige `X-Tenant-Id` e proprietário; body `{ "planPublicId": "..." }`.
- `POST /tenant/billing/stripe/portal` — autenticada, exige `X-Tenant-Id`; retorna a URL temporária do Customer Portal.
- `POST /tenant/billing/stripe/cancel` — autenticada e somente proprietário; agenda cancelamento no fim do período.
- `POST /webhooks/stripe` — pública, sem sessão; exige `Stripe-Signature` e raw body.

Cadastre no Stripe Dashboard, em TEST mode, os eventos `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` e `invoice.payment_failed`.

No deploy documentado do projeto, o webhook deve apontar para `https://agendei.site/webhooks/stripe` (ou para o domínio público efetivamente configurado). O processo Hostinger precisa expor HTTPS, executar `npm run build` e aplicar `npm run db:migrate:deploy` antes do restart. A migration é backward-compatible.

Os eventos são gravados em `stripe_webhook_events` com `external_event_id` único, permitindo retry seguro após restart/deploy. A alteração de preço cria um novo Price por meio de `syncStripePrice`; assinaturas existentes mantêm o Price original.
