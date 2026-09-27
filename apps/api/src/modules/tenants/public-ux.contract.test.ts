import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(new URL(`../../../../web/src/${path}`, import.meta.url), 'utf8');
const bookingHook = read('components/public/use-public-booking.ts');
const premiumApp = read('components/public/premium/PremiumApp.tsx');
const publicPage = read('routes/PublicTenantPage.tsx');
const classicFlow = read('components/PublicBookingFlow.tsx');
const accountPage = read('routes/CustomerAccountPage.tsx');
const accountCore = read('components/public/account/customer-account.ts');
const accountLayout = read('components/public/account/CustomerAccountLayout.tsx');
const accountAuth = read('components/public/account/CustomerAccountAuth.tsx');
const accountSecurity = read('components/public/account/CustomerAccountSecurity.tsx');
const accountProfileScreen = read('components/public/account/CustomerProfileScreen.tsx');

describe('booking do cliente autenticado', () => {
  it('resolve os dados do perfil na camada compartilhada, não nas apresentações', () => {
    expect(bookingHook).toContain('CustomerProfileResponseSchema');
    expect(bookingHook).toContain('profileComplete');
    // Nem Classic nem Premium repetem a regra.
    expect(premiumApp).not.toContain('CustomerProfileResponseSchema');
    expect(classicFlow).not.toContain('CustomerProfileResponseSchema');
  });

  it('remove o passo "Seus dados" do fluxo — e do progresso — quando o perfil está completo', () => {
    expect(bookingHook).toContain("(id !== 'customer' || !profileComplete)");
    // O progresso das duas apresentações é derivado de `flow`.
    expect(bookingHook).toContain('const flow = BOOKING_STEPS.map');
  });

  it('exige o passo apenas quando falta nome ou contato', () => {
    expect(bookingHook).toContain("profile.name.trim().length >= 2");
    expect(bookingHook).toContain("(profile.whatsapp ?? profile.phone ?? '').trim() !== ''");
  });

  it('leva os dados do perfil para o payload do agendamento', () => {
    // O payload usa os valores efetivos: o que foi digitado tem prioridade sobre o perfil.
    expect(bookingHook).toContain('name: effectiveName.trim()');
    expect(bookingHook).toContain('phone: effectivePhone.trim()');
    expect(bookingHook).toContain('const effectiveName = customerName ===');
  });
});

describe('aba Perfil do App Premium', () => {
  it('abre a autenticação/conta diretamente, sem página intermediária', () => {
    // O atalho virou parte da navegação inferior, mas continua abrindo a conta direto.
    expect(premiumApp).toContain('const openNavigationItem');
    expect(premiumApp).toContain("if (next === 'profile') {");
    expect(premiumApp).toContain('onOpenAccount();');
    expect(premiumApp).not.toContain("{tab === 'profile' ?");
    // O texto que resta é apenas o aria-label do avatar do topo, não um CTA gigante.
    expect(premiumApp).not.toContain('Abrir minha conta');
  });
});

describe('theme-color', () => {
  it('acompanha o tema do tenant e restaura o valor global ao desmontar', () => {
    expect(publicPage).toContain("meta[name=\"theme-color\"]");
    expect(publicPage).toContain("site.data.site.theme === 'LUXURY'");
    expect(publicPage).toContain('meta.content = previous;');
  });

  it('mantém a identidade global do Agendei no index.html', () => {
    expect(
      readFileSync(new URL('../../../../web/index.html', import.meta.url), 'utf8'),
    ).toContain('<meta name="theme-color"');
  });
});

describe('pagamento online', () => {
  it('apresenta os métodos como botão com ícone, título e auxiliar', () => {
    expect(classicFlow).toContain('payment-cta');
    expect(classicFlow).toContain('IconQrcode');
    expect(classicFlow).toContain('payment-cta-body');
  });

  it('mostra valor, QR Code, código e feedback de cópia sem alert', () => {
    expect(classicFlow).toContain('payment-panel-amount');
    expect(classicFlow).toContain('Código copiado');
    expect(classicFlow).not.toContain('alert(');
  });

  it('mantém uma única máquina de cobrança para Classic e Premium', () => {
    expect(classicFlow).toContain('export function AppointmentPaymentPanel');
    expect(read('components/public/premium/PremiumBooking.tsx')).toContain(
      'AppointmentPaymentPanel',
    );
  });
});

describe('Minha Conta', () => {
  it('vive em página inteira, não mais em modal', () => {
    expect(accountPage).toContain('CustomerAccountLayout');
    expect(accountCore).toContain('accountPath');
    expect(publicPage).not.toContain('CustomerAccountSheet');
    expect(publicPage).not.toContain('accountOpen');
  });

  it('tem uma seção por URL, incluindo segurança', () => {
    expect(accountCore).toContain("{ id: 'security', label: 'Segurança', path: 'seguranca' }");
    expect(accountPage).toContain("section === 'loyalty' ? <CustomerLoyalty");
    expect(accountPage).toContain("section === 'reviews' ? <CustomerReviews");
  });

  it('mostra identidade com avatar e ações de foto', () => {
    // A identidade saiu do shell e passou a abrir a tela de perfil pelo avatar do topo.
    expect(accountLayout).toContain("aria-label=\"Abrir perfil\"");
    expect(accountLayout).toContain('client-avatar client-avatar--small');
    expect(accountProfileScreen).toContain('client-avatar client-avatar--large');
    expect(accountSecurity).toContain('Alterar foto');
  });

  it('atualiza o avatar sem refresh, com cache bust por photoUpdatedAt', () => {
    expect(accountCore).toContain('queryClient.setQueryData(meKey, data)');
    expect(accountLayout).toContain('customer/photo?v=');
  });

  it('oferece "Esqueci minha senha?" no login público', () => {
    expect(accountAuth).toContain('Esqueci minha senha?');
    expect(accountCore).toContain('customer/forgot-password');
    expect(accountAuth).toContain(
      'Se existir uma conta associada a este e-mail, enviaremos as instruções',
    );
  });

  it('só mostra a conta para cliente autenticado e volta ao tenant no logout', () => {
    expect(accountPage).toContain('{customer === null ? <CustomerAccountAuth');
    expect(accountSecurity).toContain('account.logout.mutate(');
    expect(accountSecurity).toContain('navigate(`/public/${slug}`)');
  });
});
