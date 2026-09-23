import { IconActivity, IconCreditCard, IconPlayerPause, IconClock } from '@tabler/icons-react';

type Props = { subscriptions: Array<{ status: string; priceCents?: number | string | null }> };

export function SubscriptionKpiCards({ subscriptions }: Props) {
  const active = subscriptions.filter((item) => item.status === 'ACTIVE');
  const trial = subscriptions.filter((item) => item.status === 'TRIALING');
  const suspended = subscriptions.filter((item) => item.status === 'SUSPENDED');
  const mrr = active.reduce((total, item) => total + Number(item.priceCents ?? 0), 0) / 100;
  const cards = [
    { label: 'MRR estimado', value: mrr.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), icon: IconCreditCard, tone: 'indigo' },
    { label: 'Assinaturas ativas', value: active.length, icon: IconActivity, tone: 'emerald' },
    { label: 'Em trial', value: trial.length, icon: IconClock, tone: 'amber' },
    { label: 'Suspensas', value: suspended.length, icon: IconPlayerPause, tone: 'rose' },
  ];
  return <div className="platform-subscription-kpis" aria-label="Indicadores de assinaturas">
    {cards.map(({ label, value, icon: Icon, tone }) => <article className={`platform-kpi-card platform-kpi-card--${tone}`} key={label}>
      <Icon size={20} stroke={1.8} aria-hidden="true" /><span>{label}</span><strong>{value}</strong>
    </article>)}
  </div>;
}
