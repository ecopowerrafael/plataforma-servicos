import { IconArrowUpRight, IconCalendar, IconCreditCard } from '@tabler/icons-react';
import { billingCycleLabel } from '../../platform/plan-billing-options.js';

export function SubscriptionStatusHero({ plan, subscription, commercial, onPay }: any) {
  const status = commercial.state === 'TRIALING' ? 'trial' : subscription.status === 'ACTIVE' ? 'active' : subscription.status === 'PAST_DUE' ? 'pending' : 'danger';
  const labels: Record<string, string> = { active: 'Ativa', pending: 'Pagamento pendente', trial: 'Período de teste', danger: 'Precisa de atenção' };
  const money = (Number(subscription.priceCents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: subscription.currency || 'BRL' });
  return <section className={`billing-hero billing-hero--${status}`}>
    <div className="billing-hero__glow" />
    <div className="billing-hero__content">
      <div className="billing-hero__top"><span className="billing-kicker">PLANO ATUAL</span><span className={`billing-status billing-status--${status}`}><span />{labels[status]}</span></div>
      <h2>{plan.name}</h2>
      <p className="billing-hero__price"><strong>{money}</strong> <span>/ {billingCycleLabel(subscription.billingCycle).toLowerCase()}</span></p>
      <div className="billing-hero__meta"><span><IconCalendar size={16} /> Renovação em {new Date(subscription.currentPeriodEndsAt).toLocaleDateString('pt-BR')}</span>{commercial.trialDaysRemaining !== null ? <span>Restam {commercial.trialDaysRemaining} dias de teste</span> : null}</div>
    </div>
    {status !== 'active' && <button className="billing-primary-button" type="button" onClick={onPay}><IconCreditCard size={18} /> Pagar assinatura <IconArrowUpRight size={17} /></button>}
  </section>;
}
