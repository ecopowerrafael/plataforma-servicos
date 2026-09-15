import { IconCreditCard, IconFileDescription, IconHistory } from '@tabler/icons-react';

export type SubscriptionDetailTab = 'overview' | 'history' | 'billing';
export function SubscriptionTabsNav({ active, onChange }: { active: SubscriptionDetailTab; onChange: (tab: SubscriptionDetailTab) => void }) {
  const tabs = [
    ['overview', 'Visão geral', IconFileDescription],
    ['history', 'Histórico comercial', IconHistory],
    ['billing', 'Cobranças', IconCreditCard],
  ] as const;
  return <nav className="subscription-tabs" aria-label="Detalhes da assinatura">{tabs.map(([id, label, Icon]) => <button className={active === id ? 'is-active' : ''} key={id} onClick={() => onChange(id)} type="button"><Icon size={17} />{label}</button>)}</nav>;
}
