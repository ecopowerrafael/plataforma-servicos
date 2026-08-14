import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const readWeb = (path: string) =>
  readFileSync(new URL(`../../../../web/src/${path}`, import.meta.url), 'utf8');

const router = readWeb('router.tsx');
const publicPage = readWeb('routes/PublicTenantPage.tsx');
const accountPage = readWeb('routes/CustomerAccountPage.tsx');
const accountCore = readWeb('components/public/account/customer-account.ts');
const accountLayout = readWeb('components/public/account/CustomerAccountLayout.tsx');
const accountHome = readWeb('components/public/account/CustomerAccountHome.tsx');
const appointments = readWeb('components/CustomerAppointments.tsx');
const loyalty = readWeb('components/CustomerLoyalty.tsx');
const reviews = readWeb('components/CustomerReviews.tsx');
const favorites = readWeb('components/CustomerFavorites.tsx');
const pushNotifications = readWeb('components/CustomerPushNotifications.tsx');
const accountStyles = readWeb('customer-account.css');
const agenda = readWeb('components/professionals/MyAgendaModule.tsx');
const status = readWeb('components/appointments/appointment-status.tsx');
const header = readWeb('components/public/PublicHeader.tsx');

const SECTION_PATHS = [
  'dados',
  'agendamentos',
  'fidelidade',
  'favoritos',
  'avaliacoes',
  'notificacoes',
  'seguranca',
];

describe('rotas da conta do cliente', () => {
  it('registra a área da conta com deep link por seção', () => {
    expect(router).toContain("{ path: '/public/:slug/conta', element: <CustomerAccountPage /> }");
    expect(router).toContain(
      "{ path: '/public/:slug/conta/:section', element: <CustomerAccountPage /> }",
    );
  });

  it('cobre as sete seções pedidas', () => {
    for (const path of SECTION_PATHS) expect(accountCore).toContain(`path: '${path}'`);
    expect(accountCore).toContain('sectionFromPath');
  });

  it('o botão de conta navega em vez de abrir modal', () => {
    expect(publicPage).toContain('navigate(`/public/${slug}/conta`)');
    expect(publicPage).not.toContain('CustomerAccountSheet');
    expect(header).toContain('onOpenAccount');
  });

  it('mostra login quando não há sessão', () => {
    expect(accountPage).toContain('{customer === null ? <CustomerAccountAuth');
    expect(accountCore).toContain('customer/login');
    expect(accountCore).toContain('customer/register');
  });

  it('herda os tokens do tenant na área da conta', () => {
    for (const token of [
      '--tenant-primary',
      '--tenant-surface',
      '--tenant-text',
      '--tenant-header',
      '--tenant-navigation',
      '--tenant-active',
    ])
      expect(accountPage).toContain(token);
  });

  it('a home usa apenas dados reais já disponíveis', () => {
    expect(accountHome).toContain('customer/appointments/upcoming');
    expect(accountHome).toContain('customer/loyalty');
    expect(accountHome).toContain('Meus agendamentos');
    expect(accountHome).toContain('Agendar');
    expect(accountHome).toContain('Favoritos');
    expect(accountHome).toContain('Perfil');
  });

  it('usa shell de aplicativo com navegação inferior, sem a navegação horizontal anterior', () => {
    expect(accountLayout).toContain('customer-bottom-navigation');
    expect(accountLayout).not.toContain('customer-account-nav');
    for (const item of ['Início', 'Agendamentos', 'Favoritos', 'Perfil'])
      expect(accountLayout).toContain(item);
    expect(accountStyles).toContain('position: fixed');
    expect(accountStyles).not.toContain('.customer-account-nav');
  });

  it('mantém o perfil e a aparência white-label baseados nos tokens existentes', () => {
    for (const item of ['Meus dados', 'Pontos de fidelidade', 'Segurança', 'Sair'])
      expect(accountLayout).toContain(item);
    for (const token of ['--tenant-primary', '--tenant-navigation', '--tenant-active'])
      expect(accountStyles).toContain(token);
  });
});

describe('agendamentos do cliente', () => {
  it('preserva os endpoints e as regras de ação', () => {
    for (const endpoint of ['/cancel', '/reschedule', '/review'])
      expect(appointments).toContain(endpoint);
    expect(appointments).toContain('cancelableStatuses');
    expect(appointments).toContain('rescheduleableStatuses');
  });

  it('usa cartões e abas, sem lista crua', () => {
    expect(appointments).toContain('customer-appointment-list');
    expect(appointments).toContain('Ver detalhes');
    expect(appointments).toMatch(/role="tab"[\s\S]*Próximos/u);
    expect(appointments).toMatch(/role="tab"[\s\S]*Histórico/u);
    expect(appointments).not.toContain('<li>');
    expect(appointments).not.toContain('<ul>');
  });

  it('trata carregamento, erro e vazio', () => {
    expect(appointments).toContain('customer-skeleton-list');
    expect(appointments).toContain('Não foi possível carregar os agendamentos.');
    expect(appointments).toContain('Nenhum agendamento futuro.');
  });
});

describe('demais seções da conta', () => {
  it('fidelidade, avaliações e favoritos deixaram de usar listas cruas', () => {
    for (const source of [loyalty, reviews, favorites]) {
      expect(source).not.toContain('<ul>');
      expect(source).not.toContain('<li>');
      expect(source).toContain('customer-');
    }
  });
  it('mantém favoritos por tipo e o fluxo real de push', () => {
    expect(favorites).toContain("useState<'professional' | 'service'>");
    expect(favorites).toContain('Profissionais');
    expect(favorites).toContain('Serviços');
    expect(pushNotifications).toContain('usePushSubscription');
    expect(pushNotifications).not.toContain('requestPermission');
  });
});

describe('minha agenda', () => {
  it('mantém endpoints e transições de status', () => {
    expect(agenda).toContain('/tenant/professionals/me');
    expect(agenda).toContain('/tenant/professionals/me/agenda?from=');
    expect(agenda).toContain('/appointments/${publicId}/notes');
    expect(agenda).toContain('${status.toLowerCase()}');
    expect(agenda).toContain("CONFIRMED: ['IN_PROGRESS', 'NO_SHOW']");
    expect(agenda).toContain("IN_PROGRESS: ['COMPLETED']");
  });

  it('agrupa por dia sem lista crua', () => {
    expect(agenda).not.toContain('<ul>');
    expect(agenda).not.toContain('<li>');
    expect(agenda).toContain('reduce<Map<string, Appointment[]>>');
    expect(agenda).toContain('Hoje — ');
  });

  it('mantém filtros de período e o atalho Hoje', () => {
    expect(agenda).toContain('agenda-filters');
    expect(agenda).toMatch(/setFrom\(today\(\)\);[\s\S]*Hoje/u);
  });

  it('tem detalhes, observações, vazio, carregando e erro', () => {
    expect(agenda).toContain('Ver detalhes');
    expect(agenda).toContain('Salvar observações');
    expect(agenda).toContain('Nenhum atendimento no período.');
    expect(agenda).toContain('ListSkeleton');
    expect(agenda).toContain('Não foi possível carregar a agenda');
  });
});

describe('status compartilhado', () => {
  it('centraliza os rótulos em um único módulo', () => {
    for (const value of [
      'PENDING',
      'CONFIRMED',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELED',
      'NO_SHOW',
    ])
      expect(status).toContain(value);
    for (const source of [appointments, agenda]) {
      expect(source).toContain('AppointmentStatusBadge');
      expect(source).not.toContain('const statusLabel');
    }
  });
});
