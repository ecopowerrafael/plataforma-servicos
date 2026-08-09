import {
  AuthMeResponseSchema,
  AuthSessionsResponseSchema,
  HealthResponseSchema,
  SuccessResponseSchema,
  TenantExperienceResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { AppointmentModule } from '../components/appointments/AppointmentModule.js';
import { CalendarModule } from '../components/calendar/CalendarModule.js';
import { CustomerModule } from '../components/customers/CustomerModule.js';
import { MyAgendaModule } from '../components/professionals/MyAgendaModule.js';
import { MyAvailabilityModule } from '../components/professionals/MyAvailabilityModule.js';
import { MyCommissionsModule } from '../components/professionals/MyCommissionsModule.js';
import { ProfessionalModule } from '../components/professionals/ProfessionalModule.js';
import { ComboModule } from '../components/services/ComboModule.js';
import { ServiceCategoryModule } from '../components/services/ServiceCategoryModule.js';
import { ServiceModule } from '../components/services/ServiceModule.js';
import { CashRegisterModule } from '../components/tenants/CashRegisterModule.js';
import { CommissionsModule } from '../components/tenants/CommissionsModule.js';
import { CustomerRecoveryModule } from '../components/tenants/CustomerRecoveryModule.js';
import { DelinquencyModule } from '../components/tenants/DelinquencyModule.js';
import { FinancialClosingModule } from '../components/tenants/FinancialClosingModule.js';
import { FinancialReportModule } from '../components/tenants/FinancialReportModule.js';
import { IntegrationsModule } from '../components/tenants/IntegrationsModule.js';
import { MembersModule } from '../components/tenants/MembersModule.js';
import { MultiUnitOverviewModule } from '../components/tenants/MultiUnitOverviewModule.js';
import { NotificationLogModule } from '../components/tenants/NotificationLogModule.js';
import { NotificationTemplateModule } from '../components/tenants/NotificationTemplateModule.js';
import { OperationsDashboardModule } from '../components/tenants/OperationsDashboardModule.js';
import { PaymentGatewayModule } from '../components/tenants/PaymentGatewayModule.js';
import { PaymentMethodsModule } from '../components/tenants/PaymentMethodsModule.js';
import { PaymentOptionsModule } from '../components/tenants/PaymentOptionsModule.js';
import { TenantDomainModule } from '../components/tenants/TenantDomainModule.js';
import { TenantSettingsModule } from '../components/tenants/TenantSettingsModule.js';
import { TenantSubscriptionModule } from '../components/tenants/TenantSubscriptionModule.js';
import { UnitsModule } from '../components/tenants/UnitsModule.js';
import { WhiteLabelModule } from '../components/tenants/WhiteLabelModule.js';
import { HttpError, httpClient } from '../lib/http.js';
import { clearSelectedTenant, readSelectedTenant } from '../lib/tenant-selection.js';

export function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const selectedTenant = readSelectedTenant();
  const me = useQuery({
    queryKey: ['auth', 'me', selectedTenant],
    queryFn: () =>
      httpClient.request('/auth/me', {
        schema: AuthMeResponseSchema,
        ...(selectedTenant === undefined ? {} : { tenantPublicId: selectedTenant }),
      }),
    retry: false,
  });
  const health = useQuery({
    queryKey: ['api', 'health'],
    queryFn: () => httpClient.request('/health', { schema: HealthResponseSchema }),
    refetchInterval: 60_000,
  });
  const experience = useQuery({
    queryKey: ['tenant', selectedTenant, 'experience'],
    queryFn: () =>
      httpClient.request('/tenant/experience', {
        schema: TenantExperienceResponseSchema,
        ...(selectedTenant === undefined ? {} : { tenantPublicId: selectedTenant }),
      }),
    enabled: selectedTenant !== undefined,
    retry: false,
  });
  const sessions = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: () => httpClient.request('/auth/sessions', { schema: AuthSessionsResponseSchema }),
    retry: false,
  });
  const finishSession = () => {
    clearSelectedTenant();
    queryClient.clear();
    void navigate('/login');
  };
  const revokeSession = useMutation({
    mutationFn: (sessionPublicId: string) =>
      httpClient.request(`/auth/sessions/${sessionPublicId}`, {
        method: 'DELETE',
        schema: SuccessResponseSchema,
      }),
    onSuccess: (_result, sessionPublicId) => {
      if (
        sessions.data?.sessions.some(
          (session) => session.publicId === sessionPublicId && session.current,
        )
      ) {
        finishSession();
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    },
  });
  const logoutAll = useMutation({
    mutationFn: () =>
      httpClient.request('/auth/logout-all', {
        method: 'POST',
        body: {},
        schema: SuccessResponseSchema,
      }),
    onSuccess: finishSession,
  });

  const canUpdateTenantSettings =
    me.data?.currentTenant?.membership.permissions.includes('tenant.update') ?? false;
  const canManageUnits =
    (me.data?.currentTenant?.membership.permissions.includes('unit.create') ?? false) ||
    (me.data?.currentTenant?.membership.permissions.includes('unit.update') ?? false);
  const canReadUnits =
    me.data?.currentTenant?.membership.permissions.includes('unit.read') ?? false;
  const canFitIn =
    me.data?.currentTenant?.membership.permissions.includes('appointment.fit_in.manage') ?? false;
  const canCheckIn =
    me.data?.currentTenant?.membership.permissions.includes('appointment.checkin.manage') ?? false;
  const canReadPayments =
    me.data?.currentTenant?.membership.permissions.includes('payment.read') ?? false;
  const canManagePayments =
    me.data?.currentTenant?.membership.permissions.includes('payment.manage') ?? false;
  const canReadCash = me.data?.currentTenant?.membership.permissions.includes('cash.read') ?? false;
  const canManageCash =
    me.data?.currentTenant?.membership.permissions.includes('cash.manage') ?? false;
  const canReadCommissions =
    me.data?.currentTenant?.membership.permissions.includes('commission.read') ?? false;
  const canReadFinancialClosings =
    me.data?.currentTenant?.membership.permissions.includes('financial_closing.read') ?? false;
  const canManageFinancialClosings =
    me.data?.currentTenant?.membership.permissions.includes('financial_closing.manage') ?? false;
  const canReadFinancialReports =
    me.data?.currentTenant?.membership.permissions.includes('financial_report.read') ?? false;
  const canReadPaymentGateway =
    me.data?.currentTenant?.membership.permissions.includes('payment_gateway.read') ?? false;
  const canManagePaymentGateway =
    me.data?.currentTenant?.membership.permissions.includes('payment_gateway.manage') ?? false;
  const canViewOwnAgenda =
    me.data?.currentTenant?.membership.permissions.includes('professional.self.read') ?? false;
  const canReadMembers =
    me.data?.currentTenant?.membership.permissions.includes('membership.read') ?? false;
  const canManageMembers =
    (me.data?.currentTenant?.membership.permissions.includes('membership.invite') ?? false) ||
    (me.data?.currentTenant?.membership.permissions.includes('membership.update') ?? false) ||
    (me.data?.currentTenant?.membership.permissions.includes('membership.suspend') ?? false);
  const canViewSubscription =
    me.data?.currentTenant?.membership.permissions.includes('tenant.subscription.read') ?? false;
  const canViewOperations =
    me.data?.currentTenant?.membership.permissions.includes('appointment.read') ?? false;
  const canViewNotifications =
    me.data?.currentTenant?.membership.permissions.includes('notification.read') ?? false;
  const canManageNotificationTemplates =
    me.data?.currentTenant?.membership.permissions.includes('notification.template.manage') ??
    false;
  const canManageBranding =
    me.data?.currentTenant?.membership.permissions.includes('tenant.branding.manage') ?? false;
  const canReadAutomations =
    me.data?.currentTenant?.membership.permissions.includes('automation.read') ?? false;
  const canManageAutomations =
    me.data?.currentTenant?.membership.permissions.includes('automation.manage') ?? false;
  const canReadIntegrations =
    me.data?.currentTenant?.membership.permissions.includes('integration.read') ?? false;
  const canManageIntegrations =
    me.data?.currentTenant?.membership.permissions.includes('integration.manage') ?? false;

  useEffect(() => {
    if (me.error instanceof HttpError && me.error.status === 401) void navigate('/login');
    if (me.error instanceof HttpError && me.error.status === 403) void navigate('/access-denied');
  }, [me.error, navigate]);

  if (me.isPending)
    return (
      <main className="app-shell">
        <p>Carregando sessão…</p>
      </main>
    );
  if (me.data === undefined) return null;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Sessão atual</p>
          <h1>{me.data.currentTenant?.tenant.displayName ?? 'Selecione um estabelecimento'}</h1>
        </div>
        <button
          className="secondary-button"
          onClick={() => {
            void httpClient
              .request('/auth/logout', { method: 'POST', body: {}, schema: SuccessResponseSchema })
              .finally(finishSession);
          }}
        >
          Sair
        </button>
      </header>
      <section className="session-grid">
        <article className="info-card">
          <span>Usuário</span>
          <strong>{me.data.user.email}</strong>
        </article>
        <article className="info-card">
          <span>Papel</span>
          <strong>{me.data.currentTenant?.membership.roleCode ?? 'Não selecionado'}</strong>
        </article>
        <article className="info-card">
          <span>API</span>
          <strong>
            {health.isSuccess ? 'Disponível' : health.isPending ? 'Verificando' : 'Indisponível'}
          </strong>
        </article>
      </section>
      {me.data.tenants.length > 1 || me.data.currentTenant === null ? (
        <button className="text-button" onClick={() => void navigate('/select-tenant')}>
          {me.data.currentTenant === null ? 'Selecionar estabelecimento' : 'Trocar estabelecimento'}
        </button>
      ) : null}
      {selectedTenant !== undefined && me.data.currentTenant !== null && (
        <>
          <TenantSettingsModule
            tenantPublicId={selectedTenant}
            canUpdate={canUpdateTenantSettings}
          />
          <UnitsModule tenantPublicId={selectedTenant} canManage={canManageUnits} />
          {canReadUnits && <MultiUnitOverviewModule tenantPublicId={selectedTenant} />}
          {canViewSubscription && <TenantSubscriptionModule tenantPublicId={selectedTenant} />}
          {canViewOperations && <OperationsDashboardModule tenantPublicId={selectedTenant} />}
          {canReadPayments && (
            <PaymentMethodsModule tenantPublicId={selectedTenant} canManage={canManagePayments} />
          )}
          {canReadCash && (
            <CashRegisterModule tenantPublicId={selectedTenant} canManage={canManageCash} />
          )}
          {canReadCommissions && <CommissionsModule tenantPublicId={selectedTenant} />}
          {canReadFinancialClosings && (
            <FinancialClosingModule
              tenantPublicId={selectedTenant}
              canManage={canManageFinancialClosings}
            />
          )}
          {canReadPayments && <DelinquencyModule tenantPublicId={selectedTenant} />}
          {canReadFinancialReports && <FinancialReportModule tenantPublicId={selectedTenant} />}
          {canReadPaymentGateway && (
            <PaymentOptionsModule
              tenantPublicId={selectedTenant}
              canManage={canManagePaymentGateway}
            />
          )}
          {canReadPaymentGateway && (
            <PaymentGatewayModule
              tenantPublicId={selectedTenant}
              canManage={canManagePaymentGateway}
            />
          )}
          {canViewNotifications && <NotificationLogModule tenantPublicId={selectedTenant} />}
          {canViewNotifications && (
            <NotificationTemplateModule
              tenantPublicId={selectedTenant}
              canManage={canManageNotificationTemplates}
            />
          )}
          {canReadAutomations && (
            <CustomerRecoveryModule
              tenantPublicId={selectedTenant}
              canManage={canManageAutomations}
            />
          )}
          {canReadMembers && (
            <MembersModule tenantPublicId={selectedTenant} canManage={canManageMembers} />
          )}
          <CalendarModule tenantPublicId={selectedTenant} />
          {canViewOwnAgenda && <MyAgendaModule tenantPublicId={selectedTenant} />}
          {canViewOwnAgenda && <MyAvailabilityModule tenantPublicId={selectedTenant} />}
          {canViewOwnAgenda && <MyCommissionsModule tenantPublicId={selectedTenant} />}
          <AppointmentModule
            tenantPublicId={selectedTenant}
            canFitIn={canFitIn}
            canCheckIn={canCheckIn}
            canReadPayments={canReadPayments}
            canManagePayments={canManagePayments}
          />
          <ServiceCategoryModule tenantPublicId={selectedTenant} />
          <ProfessionalModule
            tenantPublicId={selectedTenant}
            terminology={experience.data?.terminology.professional.singular ?? 'Profissional'}
          />
          <CustomerModule
            tenantPublicId={selectedTenant}
            terminology={experience.data?.terminology.customer.singular ?? 'Cliente'}
          />
          <ServiceModule
            tenantPublicId={selectedTenant}
            terminology={experience.data?.terminology.service.singular ?? 'Servi\u00e7o'}
          />
          <ComboModule tenantPublicId={selectedTenant} />
          <WhiteLabelModule tenantPublicId={selectedTenant} />
          <TenantDomainModule tenantPublicId={selectedTenant} canManage={canManageBranding} />
          {canReadIntegrations && (
            <IntegrationsModule tenantPublicId={selectedTenant} canManage={canManageIntegrations} />
          )}
        </>
      )}
      <section className="sessions-panel" aria-labelledby="sessions-title">
        <div className="sessions-heading">
          <div>
            <p className="eyebrow">Segurança</p>
            <h2 id="sessions-title">Sessões ativas</h2>
          </div>
          <button
            className="secondary-button"
            disabled={logoutAll.isPending}
            onClick={() => {
              logoutAll.mutate();
            }}
          >
            Encerrar todas
          </button>
        </div>
        {sessions.isPending ? <p>Carregando sessões…</p> : null}
        {sessions.error instanceof Error ? (
          <p className="form-error">Não foi possível carregar as sessões.</p>
        ) : null}
        {revokeSession.error instanceof Error || logoutAll.error instanceof Error ? (
          <p className="form-error">Não foi possível encerrar a sessão.</p>
        ) : null}
        <div className="sessions-list">
          {sessions.data?.sessions.map((session) => (
            <article className="session-item" key={session.publicId}>
              <div>
                <strong>
                  {session.current
                    ? 'Esta sessão'
                    : (session.userAgent ?? 'Dispositivo não identificado')}
                </strong>
                <span>
                  Último acesso em {new Date(session.lastSeenAt).toLocaleString('pt-BR')}
                  {session.ipAddress === null ? '' : ` · IP ${session.ipAddress}`}
                </span>
              </div>
              <button
                className="secondary-button"
                disabled={revokeSession.isPending}
                onClick={() => {
                  revokeSession.mutate(session.publicId);
                }}
              >
                Encerrar
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
