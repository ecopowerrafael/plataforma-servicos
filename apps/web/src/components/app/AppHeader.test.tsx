import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AppHeader } from './AppHeader';

describe('AppHeader', () => {
  it('should render title and subtitle', () => {
    render(
      <AppHeader
        title="Dashboard"
        subtitle="Início / Agenda"
        onLogout={vi.fn()}
      />
    );

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Início / Agenda')).toBeInTheDocument();
  });

  it('should render tenant name', () => {
    render(
      <AppHeader
        title="Dashboard"
        tenantName="Meu Negócio"
        onLogout={vi.fn()}
      />
    );

    expect(screen.getByText('Meu Negócio')).toBeInTheDocument();
  });

  it('should call onLogout when logout button clicked', () => {
    const onLogout = vi.fn();
    render(
      <AppHeader
        title="Dashboard"
        onLogout={onLogout}
      />
    );

    const logoutBtn = screen.getByLabelText('Sair da conta');
    fireEvent.click(logoutBtn);

    expect(onLogout).toHaveBeenCalled();
  });

  it('should show dropdown when tenant button clicked', () => {
    const onTenantSelect = vi.fn();
    render(
      <AppHeader
        title="Dashboard"
        tenantName="Meu Negócio"
        onLogout={vi.fn()}
        onTenantSelect={onTenantSelect}
      />
    );

    const tenantBtn = screen.getByText('Meu Negócio');
    fireEvent.click(tenantBtn);

    expect(screen.getByText('Trocar estabelecimento')).toBeInTheDocument();
  });

  it('should show menu button on mobile', () => {
    render(
      <AppHeader
        title="Dashboard"
        showMobileMenu={true}
        onMenuClick={vi.fn()}
        onLogout={vi.fn()}
      />
    );

    const menuBtn = screen.getByLabelText('Abrir menu');
    expect(menuBtn).toBeInTheDocument();
  });

  it('should call onMenuClick when menu button clicked', () => {
    const onMenuClick = vi.fn();
    render(
      <AppHeader
        title="Dashboard"
        showMobileMenu={true}
        onMenuClick={onMenuClick}
        onLogout={vi.fn()}
      />
    );

    const menuBtn = screen.getByLabelText('Abrir menu');
    fireEvent.click(menuBtn);

    expect(onMenuClick).toHaveBeenCalled();
  });
});
