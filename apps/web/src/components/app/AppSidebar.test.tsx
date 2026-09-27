import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { AppSidebar, type NavGroup } from './AppSidebar';

const mockGroups: NavGroup[] = [
  {
    label: 'Agenda',
    path: '/app/agenda',
    items: [
      { label: 'Visão da agenda', to: '/app/agenda' },
      { label: 'Agendamentos', to: '/app/agenda/agendamentos' },
    ],
  },
  {
    label: 'Clientes',
    path: '/app/clientes',
    items: [
      { label: 'Clientes', to: '/app/clientes' },
    ],
  },
];

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('AppSidebar', () => {
  it('should render tenant name', () => {
    renderWithRouter(
      <AppSidebar tenantName="Meu Negócio" groups={mockGroups} />
    );

    expect(screen.getByText('Meu Negócio')).toBeInTheDocument();
  });

  it('should render all menu groups', () => {
    renderWithRouter(
      <AppSidebar tenantName="Meu Negócio" groups={mockGroups} />
    );

    expect(screen.getByText('Agenda')).toBeInTheDocument();
    expect(screen.getByText('Clientes')).toBeInTheDocument();
  });

  it('should render home link', () => {
    renderWithRouter(
      <AppSidebar tenantName="Meu Negócio" groups={mockGroups} />
    );

    expect(screen.getByText('Início')).toBeInTheDocument();
  });

  it('should expand group when header clicked', () => {
    renderWithRouter(
      <AppSidebar tenantName="Meu Negócio" groups={mockGroups} />
    );

    const agendaHeader = screen.getAllByText('Agenda')[0];
    fireEvent.click(agendaHeader);

    expect(screen.getByText('Visão da agenda')).toBeInTheDocument();
  });

  it('should show menu items when group expanded', () => {
    renderWithRouter(
      <AppSidebar tenantName="Meu Negócio" groups={mockGroups} />
    );

    const agendaHeader = screen.getAllByText('Agenda')[0];
    fireEvent.click(agendaHeader);

    expect(screen.getByText('Agendamentos')).toBeInTheDocument();
  });

  it('should apply active class to current route', () => {
    renderWithRouter(
      <AppSidebar tenantName="Meu Negócio" groups={mockGroups} />
    );

    const homeLink = screen.getByText('Início').closest('a');
    expect(homeLink).toHaveClass('active');
  });

  it('should collapse when is-collapsed prop set', () => {
    const { container } = renderWithRouter(
      <AppSidebar
        tenantName="Meu Negócio"
        groups={mockGroups}
        isCollapsed={true}
      />
    );

    const sidebar = container.querySelector('.app-sidebar');
    expect(sidebar).toHaveClass('is-collapsed');
  });

  it('should render subitems in submenu with indentation', () => {
    const groupsWithSubitems: NavGroup[] = [
      {
        label: 'Financeiro',
        path: '/app/financeiro',
        items: [
          {
            label: 'Visão geral',
            to: '/app/financeiro',
            items: [
              { label: 'Caixa', to: '/app/financeiro/caixa' },
              { label: 'Pendências', to: '/app/financeiro/pendencias' },
            ],
          },
        ],
      },
    ];

    renderWithRouter(
      <AppSidebar tenantName="Meu Negócio" groups={groupsWithSubitems} />
    );

    const financeHeader = screen.getAllByText('Financeiro')[0];
    fireEvent.click(financeHeader);

    const visaoGeralBtn = screen.getByText('Visão geral');
    fireEvent.click(visaoGeralBtn);

    expect(screen.getByText('Caixa')).toBeInTheDocument();
  });
});
