import { CommercialPlanPublicSchema, PlanLimitKeys } from '@plataforma/shared';
import { Link } from 'react-router-dom';
import { type z } from 'zod';

import { MarketingShell } from '../marketing/MarketingShell.js';
import { PricingCards, formatPlanLimit, trialMessage } from '../marketing/PricingCards.js';
import { planLimitLabels } from '../marketing/marketing-data.js';
import { usePageMetadata } from '../marketing/use-page-metadata.js';
import { usePublicPlans } from '../marketing/use-public-plans.js';

type Plan = z.infer<typeof CommercialPlanPublicSchema>;

function limitFor(plan: Plan, key: (typeof PlanLimitKeys)[number]) {
  return plan.limits.find((limit) => limit.key === key);
}

export function PricingPage() {
  const query = usePublicPlans();
  const trial = trialMessage(query.data?.plans, query.data?.defaultTrialDays);

  usePageMetadata({
    title: 'Planos e assinaturas | Plataforma de Serviços',
    description:
      'Compare os planos da Plataforma de Serviços com preços, períodos, trial, limites de unidades, equipe, agendamentos e recursos habilitados.',
    path: '/planos',
  });

  return (
    <MarketingShell>
      <section className="marketing-page-hero pricing-page-hero">
        <div className="marketing-container marketing-page-hero-inner">
          <p className="marketing-kicker">Planos configurados na plataforma</p>
          <h1>O plano certo para o tamanho da sua operação.</h1>
          <p>
            Compare mensalidade, período gratuito, limites e recursos. Todos os dados abaixo vêm da
            configuração comercial real.
          </p>
          <span className="pricing-page-trial">{trial}</span>
        </div>
      </section>

      <section className="marketing-section pricing-page-section" id="planos">
        <div className="marketing-container">
          {query.isPending ? (
            <div className="pricing-loading" aria-label="Carregando planos">
              <span />
              <span />
              <span />
            </div>
          ) : query.isError ? (
            <div className="pricing-empty">
              <h2>Os planos não puderam ser carregados.</h2>
              <p>Tente novamente em instantes.</p>
            </div>
          ) : (
            <>
              <PricingCards plans={query.data.plans} />
              {query.data.plans.length === 0 ? null : (
                <section className="plan-comparison" aria-labelledby="comparison-title">
                  <div className="marketing-section-heading">
                    <p className="marketing-eyebrow">Comparação detalhada</p>
                    <h2 id="comparison-title">Limites e recursos por plano</h2>
                    <p>
                      Quando um valor não foi cadastrado no plano, ele aparece como não informado.
                    </p>
                  </div>
                  <div className="plan-comparison-desktop">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Limite ou recurso</th>
                          {query.data.plans.map((plan) => (
                            <th scope="col" key={plan.publicId}>
                              {plan.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {PlanLimitKeys.map((key) => (
                          <tr key={key}>
                            <th scope="row">{planLimitLabels[key]}</th>
                            {query.data.plans.map((plan) => {
                              const limit = limitFor(plan, key);
                              return (
                                <td key={plan.publicId}>
                                  {limit === undefined ? 'Não informado' : formatPlanLimit(limit)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="plan-comparison-mobile">
                    {query.data.plans.map((plan) => (
                      <article key={plan.publicId}>
                        <h3>{plan.name}</h3>
                        <dl>
                          {PlanLimitKeys.map((key) => {
                            const limit = limitFor(plan, key);
                            return (
                              <div key={key}>
                                <dt>{planLimitLabels[key]}</dt>
                                <dd>
                                  {limit === undefined ? 'Não informado' : formatPlanLimit(limit)}
                                </dd>
                              </div>
                            );
                          })}
                        </dl>
                        <Link className="marketing-button marketing-button--full" to="/login">
                          Começar grátis
                        </Link>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </section>

      <section className="pricing-clarity-section">
        <div className="marketing-container marketing-split marketing-split--balanced">
          <div>
            <p className="marketing-eyebrow">Sem regra comercial escondida na página</p>
            <h2>O que você vê acompanha a configuração do produto.</h2>
          </div>
          <div className="clarity-list">
            <p>Preços e periodicidade vêm do cadastro do plano.</p>
            <p>Limites ilimitados são apresentados em linguagem clara.</p>
            <p>O período gratuito respeita a configuração vigente.</p>
            <p>Recursos não configurados não são prometidos.</p>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
