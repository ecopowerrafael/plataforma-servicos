import { IconMessageCircle, IconClock, IconSettings } from '@tabler/icons-react';

export type WhatsappTab = 'menu' | 'automated' | 'connection';
export function TabsHeader({ activeTab, onChange }: { activeTab: WhatsappTab; onChange: (tab: WhatsappTab) => void }) {
  const tabs = [
    ['menu', 'Menu & Saudação', IconMessageCircle],
    ['automated', 'Lembretes & Disparos', IconClock],
    ['connection', 'Conexão / Status', IconSettings],
  ] as const;
  return <nav className="wa-tabs" aria-label="Configurações do WhatsApp">{tabs.map(([id, label, Icon]) => <button key={id} className={activeTab === id ? 'is-active' : ''} onClick={() => onChange(id)} type="button"><Icon size={17} />{label}</button>)}</nav>;
}
