import { IconMessageCircle, IconClock, IconSettings, IconMicrophone } from '@tabler/icons-react';

export type WhatsappTab = 'menu' | 'automated' | 'connection' | 'audio';
export function TabsHeader({ activeTab, onChange }: { activeTab: WhatsappTab; onChange: (tab: WhatsappTab) => void }) {
  const tabs = [
    ['menu', 'Mensagens', IconMessageCircle],
    ['automated', 'Configurações', IconClock],
    ['connection', 'Inteligência', IconSettings],
    ['audio', 'Áudios', IconMicrophone],
  ] as const;
  return <nav className="wa-tabs" aria-label="Configurações do WhatsApp">{tabs.map(([id, label, Icon]) => <button key={id} className={activeTab === id ? 'is-active' : ''} onClick={() => onChange(id)} type="button"><Icon size={17} />{label}</button>)}</nav>;
}
