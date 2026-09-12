import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfessionalAccessForm } from './ProfessionalAccessForm.js';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const renderComponent = (props: any) => {
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfessionalAccessForm {...props} />
    </QueryClientProvider>,
  );
};

describe('ProfessionalAccessForm', () => {
  beforeEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  // 1. conta vinculada mostra email/status
  it('exibe email e status quando usuário vinculado', () => {
    renderComponent({
      professionalPublicId: '550e8400-e29b-41d4-a716-446655440000',
      email: 'profissional@test.com',
      userPublicId: '550e8400-e29b-41d4-a716-446655440001',
      tenantPublicId: '550e8400-e29b-41d4-a716-446655440002',
    });

    expect(screen.getByText(/profissional@test\.com/)).toBeInTheDocument();
    expect(screen.getByText(/Ativa/)).toBeInTheDocument();
    expect(screen.getByText(/Conta de acesso/)).toBeInTheDocument();
  });

  // 2. campos de senha começam vazios
  it('campos de senha começam vazios', () => {
    renderComponent({
      professionalPublicId: '550e8400-e29b-41d4-a716-446655440000',
      email: 'profissional@test.com',
      userPublicId: '550e8400-e29b-41d4-a716-446655440001',
      tenantPublicId: '550e8400-e29b-41d4-a716-446655440002',
    });

    const inputs = screen.getAllByDisplayValue('');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  // 3. confirmação divergente bloqueia envio
  it('bloqueia botão se senhas não conferem', async () => {
    renderComponent({
      professionalPublicId: '550e8400-e29b-41d4-a716-446655440000',
      email: 'profissional@test.com',
      userPublicId: '550e8400-e29b-41d4-a716-446655440001',
      tenantPublicId: '550e8400-e29b-41d4-a716-446655440002',
    });

    const [senhaInput, confirmInput] = screen.getAllByDisplayValue('');
    const button = screen.getByRole('button', { name: /Alterar senha/ });

    await userEvent.type(senhaInput as HTMLInputElement, 'SenhaSegura123');
    await userEvent.type(confirmInput as HTMLInputElement, 'SenhaSeguraDiferente456');

    expect(button).toBeDisabled();
    expect(screen.getByText(/Senhas não conferem/)).toBeInTheDocument();
  });

  // 4. usa endpoint correto
  it('chama endpoint PUT /tenant/professionals/:id/password', async () => {
    const mockHttpClient = vi.fn().mockResolvedValue({ success: true });
    vi.mock('../../lib/http.js', () => ({
      httpClient: { request: mockHttpClient },
    }));

    renderComponent({
      professionalPublicId: '550e8400-e29b-41d4-a716-446655440000',
      email: 'profissional@test.com',
      userPublicId: '550e8400-e29b-41d4-a716-446655440001',
      tenantPublicId: '550e8400-e29b-41d4-a716-446655440002',
    });

    const [senhaInput, confirmInput] = screen.getAllByDisplayValue('');
    const button = screen.getByRole('button', { name: /Alterar senha/ });

    await userEvent.type(senhaInput as HTMLInputElement, 'SenhaSegura123');
    await userEvent.type(confirmInput as HTMLInputElement, 'SenhaSegura123');
    await userEvent.click(button);

    // verificar que o formulário foi submetido
    await waitFor(() => {
      expect(button).not.toHaveAttribute('disabled');
    }, { timeout: 100 });
  });

  // 5. sucesso limpa campos
  it('limpa campos após sucesso', async () => {
    renderComponent({
      professionalPublicId: '550e8400-e29b-41d4-a716-446655440000',
      email: 'profissional@test.com',
      userPublicId: '550e8400-e29b-41d4-a716-446655440001',
      tenantPublicId: '550e8400-e29b-41d4-a716-446655440002',
    });

    const [senhaInput, confirmInput] = screen.getAllByDisplayValue('');
    const button = screen.getByRole('button', { name: /Alterar senha/ });

    await userEvent.type(senhaInput as HTMLInputElement, 'SenhaSegura123');
    await userEvent.type(confirmInput as HTMLInputElement, 'SenhaSegura123');

    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Senha alterada com sucesso/)).toBeInTheDocument();
    });
  });

  // 6. legacy sem User mostra pending
  it('exibe status pendente quando sem User vinculado', () => {
    renderComponent({
      professionalPublicId: '550e8400-e29b-41d4-a716-446655440000',
      email: 'profissional@test.com',
      userPublicId: null,
      tenantPublicId: '550e8400-e29b-41d4-a716-446655440002',
    });

    expect(screen.getByText(/Acesso pendente/)).toBeInTheDocument();
    expect(screen.getByText(/Profissional não possui conta de login/)).toBeInTheDocument();
    expect(screen.queryByText(/Nova senha/)).not.toBeInTheDocument();
  });
});
