import { IconCalendarEvent, IconHome, IconPlus, IconScissors, IconUser } from '@tabler/icons-react';

export type PremiumTab = 'home' | 'appointments' | 'booking' | 'services' | 'profile';

const items = [
  { id: 'home', label: 'Início', Icon: IconHome },
  { id: 'appointments', label: 'Agendamentos', Icon: IconCalendarEvent },
  { id: 'services', label: 'Serviços', Icon: IconScissors },
  { id: 'profile', label: 'Perfil', Icon: IconUser },
] as const;

export function PremiumBottomNav({
  active,
  onChange,
}: {
  active: PremiumTab;
  onChange: (tab: PremiumTab) => void;
}) {
  return (
    <nav className="premium-bottom-nav" aria-label="Navegação principal">
      {items.slice(0, 2).map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          aria-current={active === id ? 'page' : undefined}
          onClick={() => {
            onChange(id);
          }}
        >
          <Icon size={22} stroke={1.6} aria-hidden="true" />
          <small>{label}</small>
        </button>
      ))}
      <button
        className="premium-nav-cta"
        type="button"
        aria-label="Agendar"
        aria-current={active === 'booking' ? 'page' : undefined}
        onClick={() => {
          onChange('booking');
        }}
      >
        <IconPlus size={24} stroke={2} aria-hidden="true" />
        <small>Agendar</small>
      </button>
      {items.slice(2).map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          aria-current={active === id ? 'page' : undefined}
          onClick={() => {
            onChange(id);
          }}
        >
          <Icon size={22} stroke={1.6} aria-hidden="true" />
          <small>{label}</small>
        </button>
      ))}
    </nav>
  );
}
