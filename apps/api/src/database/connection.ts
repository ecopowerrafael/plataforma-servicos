import { PrismaMariaDb } from '@prisma/adapter-mariadb';

import { PrismaClient } from '../database-client/client.js';
import { AppointmentOperationsService } from '../modules/appointments/appointment-operations.service.js';
import { AppointmentReviewRepository } from '../modules/appointments/appointment-review.repository.js';
import { AppointmentReviewService } from '../modules/appointments/appointment-review.service.js';
import { AppointmentRepository } from '../modules/appointments/appointment.repository.js';
import { AppointmentService } from '../modules/appointments/appointment.service.js';
import { type IdentityRepository } from '../modules/auth/identity.repository.js';
import { PasswordService } from '../modules/auth/password.service.js';
import { PrismaIdentityRepository } from '../modules/auth/prisma-identity.repository.js';
import { PublicBookingService } from '../modules/booking/public-booking.service.js';
import { AvailabilityRepository } from '../modules/calendar/availability.repository.js';
import { AvailabilityService } from '../modules/calendar/availability.service.js';
import { CustomerAuthRepository } from '../modules/customers/customer-auth.repository.js';
import { CustomerAuthService } from '../modules/customers/customer-auth.service.js';
import { CustomerFavoriteRepository } from '../modules/customers/customer-favorite.repository.js';
import { CustomerFavoriteService } from '../modules/customers/customer-favorite.service.js';
import { CustomerProfileService } from '../modules/customers/customer-profile.service.js';
import { CustomerRecoveryRepository } from '../modules/customers/customer-recovery.repository.js';
import { CustomerRecoveryService } from '../modules/customers/customer-recovery.service.js';
import { CustomerRepository } from '../modules/customers/customer.repository.js';
import { CustomerService } from '../modules/customers/customer.service.js';
import {
  MetaWhatsAppDelivery,
  WebhookDelivery,
} from '../modules/integrations/integration-delivery.js';
import { IntegrationRepository } from '../modules/integrations/integration.repository.js';
import { IntegrationService } from '../modules/integrations/integration.service.js';
import { AppointmentNotificationService } from '../modules/notifications/appointment-notification.service.js';
import { AppointmentReminderService } from '../modules/notifications/appointment-reminder.service.js';
import { AutomationService } from '../modules/notifications/automation.service.js';
import { CustomerNotificationDispatcher } from '../modules/notifications/customer-notification-dispatcher.js';
import {
  type EmailDelivery,
  SmtpEmailDelivery,
  UnconfiguredEmailDelivery,
} from '../modules/notifications/email-delivery.js';
import { NotificationTemplateService } from '../modules/notifications/notification-template.service.js';
import { NotificationService } from '../modules/notifications/notification.service.js';
import {
  type PushDelivery,
  UnconfiguredPushDelivery,
  WebPushDelivery,
} from '../modules/notifications/push-delivery.js';
import { PushSubscriptionService } from '../modules/notifications/push-subscription.service.js';
import { CashRegisterService } from '../modules/payments/cash-register.service.js';
import { DelinquencyService } from '../modules/payments/delinquency.service.js';
import { FinancialClosingService } from '../modules/payments/financial-closing.service.js';
import { FinancialReportService } from '../modules/payments/financial-report.service.js';
import { CredentialsCipher } from '../modules/payments/gateway/credentials-cipher.js';
import { FetchHttpClient } from '../modules/payments/gateway/mercadopago/http-client.js';
import { MercadoPagoProviderAdapter } from '../modules/payments/gateway/mercadopago/mercadopago.provider.js';
import { PaymentGatewayService } from '../modules/payments/gateway/payment-gateway.service.js';
import { PixLocalProviderAdapter } from '../modules/payments/gateway/pix-local.provider.js';
import { PaymentGatewayProviderRegistry } from '../modules/payments/gateway/provider-registry.js';
import { TenantPaymentOptionsService } from '../modules/payments/gateway/tenant-payment-options.service.js';
import { PaymentMethodService } from '../modules/payments/payment-method.service.js';
import { PaymentService } from '../modules/payments/payment.service.js';
import { ProfessionalCommissionService } from '../modules/payments/professional-commission.service.js';
import { ReceiptService } from '../modules/payments/receipt.service.js';
import { PlatformService } from '../modules/platform/platform.service.js';
import { PrismaProfessionalScheduleRepository } from '../modules/professionals/professional-schedule.repository.js';
import { ProfessionalScheduleService } from '../modules/professionals/professional-schedule.service.js';
import { PrismaProfessionalServiceRepository } from '../modules/professionals/professional-service.repository.js';
import { ProfessionalServiceLinkService } from '../modules/professionals/professional-service.service.js';
import { PrismaProfessionalUnavailabilityRepository } from '../modules/professionals/professional-unavailability.repository.js';
import { ProfessionalUnavailabilityService } from '../modules/professionals/professional-unavailability.service.js';
import { PrismaProfessionalUnitRepository } from '../modules/professionals/professional-unit.repository.js';
import { ProfessionalUnitLinkService } from '../modules/professionals/professional-unit.service.js';
import { PrismaProfessionalRepository } from '../modules/professionals/professional.repository.js';
import { ProfessionalService } from '../modules/professionals/professional.service.js';
import { PrismaComboRepository } from '../modules/services/combo.repository.js';
import { ComboService } from '../modules/services/combo.service.js';
import { PrismaServiceCategoryRepository } from '../modules/services/service-category.repository.js';
import { ServiceCategoryService } from '../modules/services/service-category.service.js';
import { LocalServiceImageStorage } from '../modules/services/service-image.storage.js';
import { PrismaServiceVariationRepository } from '../modules/services/service-variation.repository.js';
import { ServiceVariationService } from '../modules/services/service-variation.service.js';
import { PrismaServiceRepository } from '../modules/services/service.repository.js';
import { ServiceService } from '../modules/services/service.service.js';
import { PrismaBusinessUnitDateOverridesRepository } from '../modules/tenants/business-unit-date-overrides.repository.js';
import { BusinessUnitDateOverridesService } from '../modules/tenants/business-unit-date-overrides.service.js';
import { PrismaBusinessUnitOperatingHoursRepository } from '../modules/tenants/business-unit-operating-hours.repository.js';
import { BusinessUnitOperatingHoursService } from '../modules/tenants/business-unit-operating-hours.service.js';
import { MultiUnitRepository } from '../modules/tenants/multi-unit.repository.js';
import { MultiUnitService } from '../modules/tenants/multi-unit.service.js';
import { PrismaTenantRepository } from '../modules/tenants/prisma-tenant.repository.js';
import { TenantDomainRepository } from '../modules/tenants/tenant-domain.repository.js';
import {
  DnsDomainVerifier,
  TenantDomainService,
} from '../modules/tenants/tenant-domain.service.js';
import { TenantExperienceResolver } from '../modules/tenants/tenant-experience.resolver.js';
import { LocalTenantMediaStorage } from '../modules/tenants/tenant-media.storage.js';
import { TenantSubscriptionService } from '../modules/tenants/tenant-subscription.service.js';
import { TenantWhiteLabelRepository } from '../modules/tenants/tenant-white-label.repository.js';
import { TenantWhiteLabelService } from '../modules/tenants/tenant-white-label.service.js';
import { type TenantRepository } from '../modules/tenants/tenant.repository.js';

export interface DatabaseConnection {
  readonly ping: () => Promise<void>;
  readonly close: () => Promise<void>;
  readonly tenants: TenantRepository;
  readonly identities: IdentityRepository;
  readonly availability?: AvailabilityService;
  readonly appointments?: AppointmentService;
  readonly platform?: PlatformService;
  readonly customers?: CustomerService;
  readonly customerAuth?: CustomerAuthService;
  readonly customerProfile?: CustomerProfileService;
  readonly customerFavorites?: CustomerFavoriteService;
  readonly customerRecovery?: CustomerRecoveryService;
  readonly appointmentReviews?: AppointmentReviewService;
  readonly services?: ServiceService;
  readonly serviceCategories?: ServiceCategoryService;
  readonly serviceVariations?: ServiceVariationService;
  readonly combos?: ComboService;
  readonly professionals?: ProfessionalService;
  readonly professionalServices?: ProfessionalServiceLinkService;
  readonly professionalUnits?: ProfessionalUnitLinkService;
  readonly professionalSchedules?: ProfessionalScheduleService;
  readonly professionalUnavailabilities?: ProfessionalUnavailabilityService;
  readonly businessUnitOperatingHours?: BusinessUnitOperatingHoursService;
  readonly businessUnitDateOverrides?: BusinessUnitDateOverridesService;
  readonly multiUnit?: MultiUnitService;
  readonly tenantDomains?: TenantDomainService;
  readonly tenantExperience?: TenantExperienceResolver;
  readonly tenantWhiteLabel?: TenantWhiteLabelService;
  readonly tenantSubscription?: TenantSubscriptionService;
  readonly appointmentOperations?: AppointmentOperationsService;
  readonly notifications?: NotificationService;
  readonly notificationTemplates?: NotificationTemplateService;
  readonly appointmentNotifications?: AppointmentNotificationService;
  readonly appointmentReminders?: AppointmentReminderService;
  readonly automations?: AutomationService;
  readonly pushSubscriptions?: PushSubscriptionService;
  readonly vapidPublicKey?: string | null;
  readonly payments?: PaymentService;
  readonly paymentMethods?: PaymentMethodService;
  readonly cashRegisters?: CashRegisterService;
  readonly receipts?: ReceiptService;
  readonly commissions?: ProfessionalCommissionService;
  readonly financialClosings?: FinancialClosingService;
  readonly delinquency?: DelinquencyService;
  readonly financialReports?: FinancialReportService;
  readonly paymentGateway?: PaymentGatewayService;
  readonly tenantPaymentOptions?: TenantPaymentOptionsService;
  readonly integrations?: IntegrationService;
  readonly publicBooking?: PublicBookingService;
}

function readPositiveInteger(value: string | null, fallback: number): number {
  if (value === null) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

interface CustomerAuthOptions {
  publicBaseDomain?: string;
  passwordArgon2?: { memoryCost: number; timeCost: number; parallelism: number };
  sessionTtlHours?: number;
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user?: string | undefined;
    pass?: string | undefined;
    from: string;
  };
  vapid?: {
    publicKey: string;
    privateKey: string;
    subject: string;
  };
  paymentGatewayEncryptionKey?: string;
}

export function createDatabaseConnection(
  databaseUrl: string,
  customerAuthOptions?: CustomerAuthOptions,
): DatabaseConnection {
  let activeClient = createPrismaClient(databaseUrl);
  let recovery: Promise<void> | undefined;
  const client = new Proxy({} as PrismaClient, {
    get(_target, property) {
      const value: unknown = Reflect.get(activeClient, property);
      if (typeof value !== 'function') return value;
      return (...arguments_: unknown[]) => {
        const result: unknown = Reflect.apply(value, activeClient, arguments_);
        return result;
      };
    },
  });

  const reconnect = async () => {
    if (recovery !== undefined) return recovery;
    recovery = (async () => {
      await activeClient.$disconnect().catch(() => undefined);
      activeClient = createPrismaClient(databaseUrl);
      await activeClient.$queryRaw`SELECT 1`;
    })().finally(() => {
      recovery = undefined;
    });
    return recovery;
  };

  const appointmentRepository = new AppointmentRepository(client);
  const appointments = new AppointmentService(
    appointmentRepository,
    new AvailabilityService(new AvailabilityRepository(client)),
  );
  const appointmentReviews = new AppointmentReviewService(
    new AppointmentReviewRepository(client),
    appointmentRepository,
  );
  const customerRepository = new CustomerRepository(client);
  const customers = new CustomerService(customerRepository);
  const customerProfile = new CustomerProfileService(customerRepository, customers);
  const customerFavorites = new CustomerFavoriteService(new CustomerFavoriteRepository(client));
  const professionalServices = new ProfessionalServiceLinkService(
    new PrismaProfessionalServiceRepository(client),
  );
  const professionalUnits = new ProfessionalUnitLinkService(
    new PrismaProfessionalUnitRepository(client),
  );
  const tenantWhiteLabelRepository = new TenantWhiteLabelRepository(client);
  const customerAuth = new CustomerAuthService(
    customerRepository,
    new CustomerAuthRepository(client),
    tenantWhiteLabelRepository,
    new PasswordService(
      customerAuthOptions?.passwordArgon2 ?? {
        memoryCost: 65_536,
        timeCost: 3,
        parallelism: 1,
      },
    ),
    { sessionTtlHours: customerAuthOptions?.sessionTtlHours ?? 168 },
  );
  const tenantWhiteLabel = new TenantWhiteLabelService(
    tenantWhiteLabelRepository,
    new LocalTenantMediaStorage(),
    new LocalServiceImageStorage(),
    new LocalServiceImageStorage(process.env.PROFESSIONAL_IMAGE_STORAGE_DIR),
  );
  const emailDelivery: EmailDelivery =
    customerAuthOptions?.smtp === undefined
      ? new UnconfiguredEmailDelivery()
      : new SmtpEmailDelivery(customerAuthOptions.smtp);
  const pushDelivery: PushDelivery =
    customerAuthOptions?.vapid === undefined
      ? new UnconfiguredPushDelivery()
      : new WebPushDelivery(customerAuthOptions.vapid);
  const credentialsCipher =
    customerAuthOptions?.paymentGatewayEncryptionKey === undefined
      ? undefined
      : new CredentialsCipher(customerAuthOptions.paymentGatewayEncryptionKey);
  const notifications = new NotificationService(client, {
    email: emailDelivery,
    push: pushDelivery,
    whatsapp: new MetaWhatsAppDelivery(client, credentialsCipher),
    webhook: new WebhookDelivery(client, credentialsCipher),
  });
  const notificationTemplates = new NotificationTemplateService(client);
  const notificationDispatcher = new CustomerNotificationDispatcher(
    client,
    notifications,
    notificationTemplates,
  );
  const customerRecovery = new CustomerRecoveryService(
    new CustomerRecoveryRepository(client),
    notificationDispatcher,
  );
  const appointmentNotifications = new AppointmentNotificationService(
    client,
    notificationDispatcher,
  );
  const appointmentReminders = new AppointmentReminderService(client, notificationDispatcher);
  const automations = new AutomationService(client, notificationDispatcher);
  const pushSubscriptions = new PushSubscriptionService(client);
  const cashRegisters = new CashRegisterService(client);
  const commissions = new ProfessionalCommissionService(client);
  const delinquency = new DelinquencyService(client);
  const paymentMethods = new PaymentMethodService(client);
  const payments = new PaymentService(client, cashRegisters, commissions);
  const paymentGatewayRegistry = new PaymentGatewayProviderRegistry();
  paymentGatewayRegistry.register(new PixLocalProviderAdapter());
  paymentGatewayRegistry.register(new MercadoPagoProviderAdapter(new FetchHttpClient()));
  const paymentGateway = new PaymentGatewayService(
    client,
    paymentGatewayRegistry,
    credentialsCipher,
    paymentMethods,
    payments,
  );
  const tenantPaymentOptions = new TenantPaymentOptionsService(
    client,
    paymentGateway,
    payments,
    tenantWhiteLabelRepository,
  );

  return {
    identities: new PrismaIdentityRepository(client),
    availability: new AvailabilityService(new AvailabilityRepository(client)),
    appointments: appointments,
    tenants: new PrismaTenantRepository(client),
    platform: new PlatformService(client),
    customers: customers,
    customerAuth: customerAuth,
    customerProfile: customerProfile,
    customerFavorites: customerFavorites,
    customerRecovery: customerRecovery,
    appointmentReviews: appointmentReviews,
    services: new ServiceService(
      new PrismaServiceRepository(client),
      new LocalServiceImageStorage(),
    ),
    serviceCategories: new ServiceCategoryService(new PrismaServiceCategoryRepository(client)),
    serviceVariations: new ServiceVariationService(new PrismaServiceVariationRepository(client)),
    combos: new ComboService(new PrismaComboRepository(client), new LocalServiceImageStorage()),
    professionals: new ProfessionalService(
      new PrismaProfessionalRepository(client),
      new LocalServiceImageStorage(process.env.PROFESSIONAL_IMAGE_STORAGE_DIR),
    ),
    professionalServices: professionalServices,
    professionalUnits: professionalUnits,
    professionalSchedules: new ProfessionalScheduleService(
      new PrismaProfessionalScheduleRepository(client),
    ),
    professionalUnavailabilities: new ProfessionalUnavailabilityService(
      new PrismaProfessionalUnavailabilityRepository(client),
    ),
    businessUnitOperatingHours: new BusinessUnitOperatingHoursService(
      new PrismaBusinessUnitOperatingHoursRepository(client),
    ),
    businessUnitDateOverrides: new BusinessUnitDateOverridesService(
      new PrismaBusinessUnitDateOverridesRepository(client),
    ),
    multiUnit: new MultiUnitService(new MultiUnitRepository(client)),
    tenantDomains: new TenantDomainService(
      new TenantDomainRepository(client),
      new DnsDomainVerifier(),
      customerAuthOptions?.publicBaseDomain ?? null,
    ),
    tenantExperience: new TenantExperienceResolver(client),
    tenantWhiteLabel: tenantWhiteLabel,
    tenantSubscription: new TenantSubscriptionService(client),
    appointmentOperations: new AppointmentOperationsService(client),
    notifications: notifications,
    notificationTemplates: notificationTemplates,
    appointmentNotifications: appointmentNotifications,
    appointmentReminders: appointmentReminders,
    automations: automations,
    pushSubscriptions: pushSubscriptions,
    vapidPublicKey: customerAuthOptions?.vapid?.publicKey ?? null,
    payments: payments,
    paymentMethods: paymentMethods,
    cashRegisters: cashRegisters,
    receipts: new ReceiptService(client),
    commissions: commissions,
    financialClosings: new FinancialClosingService(client),
    delinquency: delinquency,
    financialReports: new FinancialReportService(client, delinquency),
    paymentGateway: paymentGateway,
    tenantPaymentOptions: tenantPaymentOptions,
    integrations: new IntegrationService(new IntegrationRepository(client), credentialsCipher),
    publicBooking: new PublicBookingService(
      tenantWhiteLabelRepository,
      tenantWhiteLabel,
      professionalServices,
      customers,
      appointments,
      new AvailabilityService(new AvailabilityRepository(client)),
    ),
    async ping() {
      try {
        await activeClient.$queryRaw`SELECT 1`;
      } catch {
        await reconnect();
      }
    },
    async close() {
      await activeClient.$disconnect();
    },
  };
}

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const url = new URL(databaseUrl);
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: readPositiveInteger(url.port || null, 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    connectionLimit: readPositiveInteger(url.searchParams.get('connection_limit'), 10),
    connectTimeout: 5_000,
    idleTimeout: 300,
  });
  return new PrismaClient({ adapter });
}
