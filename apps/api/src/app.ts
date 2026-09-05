import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { type Environment } from './config/environment.js';
import { type DatabaseConnection } from './database/connection.js';
import { AppError } from './errors/AppError.js';
import { registerErrorHandlers } from './errors/error-handler.js';
import { appointmentOperationsRoutes } from './modules/appointments/appointment-operations.routes.js';
import { appointmentWaitlistRoutes } from './modules/appointments/appointment-waitlist.routes.js';
import { appointmentRoutes } from './modules/appointments/appointment.routes.js';
import { customerAppointmentsRoutes } from './modules/appointments/customer-appointments.routes.js';
import { customerReviewsRoutes } from './modules/appointments/customer-reviews.routes.js';
import {
  customerTreatmentPlanRoutes,
  treatmentPlanRoutes,
} from './modules/appointments/treatment-plan.routes.js';
import {
  internalIdentityRoutes,
  protectedAuthRoutes,
  publicAuthRoutes,
} from './modules/auth/auth.routes.js';
import { AuthService } from './modules/auth/auth.service.js';
import { GoogleAuthService } from './modules/auth/google-auth.service.js';
import { membershipRoutes } from './modules/auth/membership.routes.js';
import {
  type AccountMessageDelivery,
  UnconfiguredAccountMessageDelivery,
} from './modules/auth/message-delivery.js';
import { PasswordService } from './modules/auth/password.service.js';
import { publicBookingRoutes } from './modules/booking/public-booking.routes.js';
import { availabilityRoutes } from './modules/calendar/availability.routes.js';
import { collectionAttemptRoutes } from './modules/collections/collection-attempt.routes.js';
import { collectionRuleRoutes } from './modules/collections/collection-rule.routes.js';
import { debtRoutes } from './modules/collections/debt.routes.js';
import { paymentPromiseRoutes } from './modules/collections/payment-promise.routes.js';
import { customerAuthRoutes } from './modules/customers/customer-auth.routes.js';
import { customerFavoriteRoutes } from './modules/customers/customer-favorite.routes.js';
import { customerMembershipChargeRoutes } from './modules/customers/customer-membership-charge.routes.js';
import { customerMembershipChargePayLocalRoutes } from './modules/customers/customer-membership-charge-paylocal.routes.js';
import { customerMembershipPaymentRoutes } from './modules/customers/customer-membership-payment.routes.js';
import { customerMembershipBenefitBalanceRoutes } from './modules/customers/customer-membership-benefit-balance.routes.js';
import { customerMembershipRoutes } from './modules/customers/customer-membership.routes.js';
import { customerMembershipPlanBenefitRoutes } from './modules/customers/customer-membership-plan-benefit.routes.js';
import { customerMembershipPlanRoutes } from './modules/customers/customer-membership-plan.routes.js';
import { customerRecoveryRoutes } from './modules/customers/customer-recovery.routes.js';
import { customerRoutes } from './modules/customers/customer.routes.js';
import { integrationRoutes } from './modules/integrations/integration.routes.js';
import { whatsappWebhookRoutes } from './modules/integrations/whatsapp-webhook.routes.js';
import { automationRoutes } from './modules/notifications/automation.routes.js';
import { notificationTemplateRoutes } from './modules/notifications/notification-template.routes.js';
import { notificationRoutes } from './modules/notifications/notification.routes.js';
import { appointmentReminderConfigRoutes } from './modules/notifications/appointment-reminder-config.routes.js';
import { pushSubscriptionRoutes } from './modules/notifications/push-subscription.routes.js';
import { registerProspectingRoutes } from './modules/prospecting/prospecting.routes.js';
import { registerProspectingOperationalRoutes } from './modules/prospecting/prospecting-operational.routes.js';
import { prospectingWhatsAppConfigRoutes } from './modules/prospecting/prospecting-whatsapp-config.routes.js';
import { cashRegisterRoutes } from './modules/payments/cash-register.routes.js';
import { commissionRoutes } from './modules/payments/commission.routes.js';
import { couponRoutes } from './modules/payments/coupon.routes.js';
import { delinquencyRoutes } from './modules/payments/delinquency.routes.js';
import { financialClosingRoutes } from './modules/payments/financial-closing.routes.js';
import { financialReportRoutes } from './modules/payments/financial-report.routes.js';
import {
  paymentGatewayRoutes,
  paymentGatewayWebhookRoutes,
} from './modules/payments/gateway/payment-gateway.routes.js';
import {
  publicTenantPaymentOptionsRoutes,
  tenantPaymentOptionsRoutes,
} from './modules/payments/gateway/tenant-payment-options.routes.js';
import { customerLoyaltyRoutes, loyaltyRoutes } from './modules/payments/loyalty.routes.js';
import { paymentMethodRoutes } from './modules/payments/payment-method.routes.js';
import { paymentRoutes } from './modules/payments/payment.routes.js';
import { receiptRoutes } from './modules/payments/receipt.routes.js';
import { platformBillingWebhookRoutes } from './modules/platform/platform-billing-webhook.routes.js';
import { platformRoutes } from './modules/platform/platform.routes.js';
import { wapiConfigRoutes } from './modules/platform/wapi-config.routes.js';
import { publicCommercialRoutes } from './modules/platform/public-commercial.routes.js';
import { directoryRoutes, publicDirectoryRoutes } from './modules/platform/directory.routes.js';
import { DirectoryLocationService } from './modules/platform/directory-location.service.js';
import { DirectoryLocationConfigService } from './modules/platform/directory-location-config.service.js';
import { productSaleRoutes } from './modules/products/product-sale.routes.js';
import { productRoutes } from './modules/products/product.routes.js';
import { stockMovementRoutes } from './modules/products/stock-movement.routes.js';
import { professionalScheduleRoutes } from './modules/professionals/professional-schedule.routes.js';
import { professionalSelfRoutes } from './modules/professionals/professional-self.routes.js';
import { professionalServiceRoutes } from './modules/professionals/professional-service.routes.js';
import { professionalUnavailabilityRoutes } from './modules/professionals/professional-unavailability.routes.js';
import { professionalUnitRoutes } from './modules/professionals/professional-unit.routes.js';
import { professionalRoutes } from './modules/professionals/professional.routes.js';
import { comboRoutes } from './modules/services/combo.routes.js';
import { serviceCategoryRoutes } from './modules/services/service-category.routes.js';
import { serviceImageMaxBytes } from './modules/services/service-image.storage.js';
import { serviceVariationRoutes } from './modules/services/service-variation.routes.js';
import { serviceRoutes } from './modules/services/service.routes.js';
import { businessUnitDateOverridesRoutes } from './modules/tenants/business-unit-date-overrides.routes.js';
import { businessUnitOperatingHoursRoutes } from './modules/tenants/business-unit-operating-hours.routes.js';
import { multiUnitRoutes } from './modules/tenants/multi-unit.routes.js';
import {
  publicTenantDomainRoutes,
  tenantDomainRoutes,
} from './modules/tenants/tenant-domain.routes.js';
import { tenantSubscriptionRoutes } from './modules/tenants/tenant-subscription.routes.js';
import {
  publicTenantWhiteLabelRoutes,
  tenantWhiteLabelRoutes,
} from './modules/tenants/tenant-white-label.routes.js';
import { tenantRoutes } from './modules/tenants/tenant.routes.js';
import { TenantService } from './modules/tenants/tenant.service.js';
import { databasePlugin } from './plugins/database.js';
import { registerStaticWeb } from './plugins/static-web.js';
import { OperationalTelemetry } from './observability/operational-telemetry.js';
import { technicalRoutes } from './routes/technical.js';

interface BuildAppOptions {
  environment: Environment;
  database: DatabaseConnection;
  logger?: boolean;
  messageDelivery?: AccountMessageDelivery;
}

function loggerOptions(environment: Environment): NonNullable<FastifyServerOptions['logger']> {
  return {
    level: environment.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers.set-cookie',
        '*.password',
        'req.body.password',
        'req.body.newPassword',
        'req.body.currentPassword',
        'req.body.token',
        '*.passwordHash',
        '*.tokenHash',
        '*.token',
        '*.accessToken',
        '*.refreshToken',
        '*.secret',
        '*.apiKey',
        '*.tenantId',
        '*.legalName',
        '*.displayName',
        '*.address',
      ],
      censor: '[REDACTED]',
    },
    ...(environment.NODE_ENV === 'development'
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:standard', singleLine: true },
          },
        }
      : {}),
  };
}

export async function buildApp(options: BuildAppOptions) {
  const serverOptions: FastifyServerOptions = {
    logger: options.logger === false ? false : loggerOptions(options.environment),
    bodyLimit: 1_048_576,
    requestIdHeader: false,
    onProtoPoisoning: 'error',
    onConstructorPoisoning: 'error',
    return503OnClosing: true,
  };
  const baseApp = Fastify(serverOptions);
  const app = baseApp.withTypeProvider<ZodTypeProvider>();
  const telemetry = new OperationalTelemetry(options.environment.OBSERVABILITY_SLOW_REQUEST_MS);
  const requestStartedAt = new WeakMap<object, number>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onRequest', (request, _reply, done) => {
    telemetry.requestStarted();
    requestStartedAt.set(request, performance.now());
    done();
  });
  app.addHook('onResponse', (request, reply, done) => {
    const startedAt = requestStartedAt.get(request);
    const durationMilliseconds = Math.max(0, performance.now() - (startedAt ?? performance.now()));
    const observation = telemetry.requestCompleted(reply.statusCode, durationMilliseconds);
    if (observation.failed) {
      request.log.error(
        {
          route: request.routeOptions.url,
          statusCode: observation.statusCode,
          durationMilliseconds: observation.durationMilliseconds,
        },
        'Alerta operacional: resposta HTTP 5xx.',
      );
    } else if (observation.slow) {
      request.log.warn(
        {
          route: request.routeOptions.url,
          statusCode: observation.statusCode,
          durationMilliseconds: observation.durationMilliseconds,
        },
        'Alerta operacional: resposta HTTP lenta.',
      );
    }
    done();
  });

  // Deploy single-origin (ex.: Node.js compartilhado da Hostinger): a própria
  // API serve o frontend Vite compilado e faz o fallback SPA. Em produção isso
  // é ligado por padrão (localizando `apps/web/dist` automaticamente, mesmo sem
  // `WEB_DIST_DIR`); fora de produção, só quando `WEB_DIST_DIR` é definido
  // (evita servir um `dist` antigo em desenvolvimento, onde o Vite serve à parte).
  const shouldServeWeb =
    options.environment.WEB_DIST_DIR !== undefined || options.environment.NODE_ENV === 'production';
  const directory = options.database.directory;
  const directorySeoPage =
    directory === undefined
      ? undefined
      : async (path: string) => {
          const parts = path.split('/').filter(Boolean);
          if (parts.length === 1)
            return {
              title: 'Encontre serviços perto de você | Agendei',
              description:
                'Encontre estabelecimentos de serviços e entre em contato para solicitar seu agendamento.',
              canonicalPath: '/encontre',
              heading: 'Encontre serviços perto de você',
              content:
                'Consulte estabelecimentos, endereço e contatos para solicitar seu agendamento.',
            };
          const categorySlug = parts[1];
          if (categorySlug === undefined) return null;
          const categories = await directory.categories();
          const category = categories.find((item) => item.slug === categorySlug);
          if (category === undefined) return null;
          if (parts.length === 2)
            return {
              title: `Encontre ${category.pluralName} | Agendei`,
              description:
                category.description ??
                `Encontre ${category.pluralName.toLowerCase()} perto de você.`,
              canonicalPath: `/encontre/${categorySlug}`,
              heading: `Encontre ${category.pluralName}`,
              content: `Veja estabelecimentos e cidades disponíveis no diretório Agendei.`,
            };
          const citySlug = parts[2];
          if (citySlug === undefined) return null;
          if (parts.length === 3) {
            const city = await directory.cityBusinesses(categorySlug, citySlug, 1, 1);
            const item = city.items[0];
            return item === undefined
              ? null
              : {
                  title: `${city.category.pluralName} em ${item.city}, ${item.state} | Agendei`,
                  description: `Encontre ${city.category.pluralName.toLowerCase()} em ${item.city}, ${item.state}, com endereço e contatos.`,
                  canonicalPath: `/encontre/${categorySlug}/${citySlug}`,
                  heading: `${city.category.pluralName} em ${item.city}`,
                  content: `Encontramos ${city.total} estabelecimentos nesta cidade.`,
                };
          }
          const businessSlug = parts[3];
          if (parts.length === 4 && businessSlug !== undefined) {
            const business = await directory.business(categorySlug, citySlug, businessSlug);
            return {
              title: `${business.name} em ${business.city}, ${business.state} | Agendei`,
              description: `Endereço e contatos de ${business.name}.`,
              canonicalPath: `/encontre/${categorySlug}/${citySlug}/${businessSlug}`,
              heading: business.name,
              content: `${business.rawAddress} · ${business.city}/${business.state}`,
            };
          }
          return null;
        };
  const spaFallback = shouldServeWeb
    ? await registerStaticWeb(app, options.environment.WEB_DIST_DIR, {
        ...(directorySeoPage === undefined ? {} : { directorySeoPage }),
      })
    : undefined;
  registerErrorHandlers(baseApp, spaFallback === undefined ? {} : { spaFallback });

  await app.register(cookie);
  await app.register(multipart, {
    limits: {
      files: 1,
      fileSize: serviceImageMaxBytes(),
    },
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });
  await app.register(cors, {
    origin(origin, callback) {
      if (origin === undefined || options.environment.CORS_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(
        new AppError({
          code: 'ORIGIN_NOT_ALLOWED',
          message: 'A origem da requisição não é permitida.',
          statusCode: 403,
        }),
        false,
      );
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Accept', 'Content-Type', 'X-Tenant-Id'],
    credentials: true,
    maxAge: 600,
  });
  await app.register(rateLimit, {
    global: false,
    hook: 'preHandler',
  });

  app.addHook('preHandler', (request, _reply, done) => {
    try {
      if (
        options.environment.NODE_ENV === 'production' &&
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
        request.cookies[options.environment.AUTH_COOKIE_NAME] !== undefined
      ) {
        const origin = request.headers.origin;
        const referer = request.headers.referer;
        let refererOrigin: string | undefined;
        try {
          refererOrigin = referer === undefined ? undefined : new URL(referer).origin;
        } catch {
          refererOrigin = undefined;
        }
        if (
          (origin === undefined || !options.environment.CORS_ORIGINS.includes(origin)) &&
          (refererOrigin === undefined || !options.environment.CORS_ORIGINS.includes(refererOrigin))
        ) {
          done(
            new AppError({
              code: 'CSRF_ORIGIN_INVALID',
              message: 'A origem da operação autenticada não é permitida.',
              statusCode: 403,
            }),
          );
          return;
        }
      }
      done();
    } catch (error) {
      done(error instanceof Error ? error : new Error('Falha na validação de origem.'));
    }
  });

  await app.register(databasePlugin, { connection: options.database });
  await app.register(technicalRoutes, { telemetry });
  const tenantService = new TenantService(options.database.tenants);
  const passwordService = new PasswordService({
    memoryCost: options.environment.PASSWORD_ARGON2_MEMORY_COST,
    timeCost: options.environment.PASSWORD_ARGON2_TIME_COST,
    parallelism: options.environment.PASSWORD_ARGON2_PARALLELISM,
  });
  const authService = AuthService.create(
    options.database.identities,
    passwordService,
    options.messageDelivery ?? new UnconfiguredAccountMessageDelivery(),
    {
      sessionTtlHours: options.environment.AUTH_SESSION_TTL_HOURS,
      maxActiveSessions: options.environment.AUTH_MAX_ACTIVE_SESSIONS,
      passwordResetTtlMinutes: options.environment.PASSWORD_RESET_TTL_MINUTES,
      invitationTtlHours: options.environment.INVITATION_TTL_HOURS,
      appWebUrl: options.environment.APP_WEB_URL,
    },
  );
  const googleAuth = new GoogleAuthService(
    options.environment.GOOGLE_CLIENT_ID ?? 'NOT_CONFIGURED',
  );
  const authRouteOptions = {
    service: authService,
    googleAuth,
    cookieName: options.environment.AUTH_COOKIE_NAME,
    client: options.database.client,
    cookieSecure: options.environment.AUTH_COOKIE_SECURE,
    sessionTtlHours: options.environment.AUTH_SESSION_TTL_HOURS,
    rateLimitMax: options.environment.LOGIN_RATE_LIMIT_MAX,
    rateLimitWindowMinutes: options.environment.LOGIN_RATE_LIMIT_WINDOW_MINUTES,
  };

  await app.register(publicAuthRoutes, authRouteOptions);
  await app.register(protectedAuthRoutes, authRouteOptions);

  if (options.environment.NODE_ENV !== 'production') {
    await app.register(internalIdentityRoutes, authRouteOptions);
  }

  await app.register(tenantRoutes, {
    service: tenantService,
    authService,
    cookieName: options.environment.AUTH_COOKIE_NAME,
    client: options.database.client,
    ...(options.database.tenantExperience === undefined
      ? {}
      : { experience: options.database.tenantExperience }),
  });
  if (options.database.businessUnitOperatingHours !== undefined) {
    await app.register(businessUnitOperatingHoursRoutes, {
      service: options.database.businessUnitOperatingHours,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  }
  if (options.database.businessUnitDateOverrides !== undefined) {
    await app.register(businessUnitDateOverridesRoutes, {
      service: options.database.businessUnitDateOverrides,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  }
  if (options.database.multiUnit !== undefined) {
    await app.register(multiUnitRoutes, {
      service: options.database.multiUnit,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  }
  if (options.database.tenantDomains !== undefined) {
    await app.register(tenantDomainRoutes, {
      service: options.database.tenantDomains,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
    await app.register(publicTenantDomainRoutes, { service: options.database.tenantDomains });
  }
  if (options.database.integrations !== undefined) {
    await app.register(integrationRoutes, {
      service: options.database.integrations,
      ...(options.database.whatsappProvisioning === undefined
        ? {}
        : { provisioning: options.database.whatsappProvisioning }),
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
    await app.register(whatsappWebhookRoutes, { service: options.database.integrations });
  }
  if (options.database.tenantWhiteLabel !== undefined) {
    await app.register(publicTenantWhiteLabelRoutes, {
      service: options.database.tenantWhiteLabel,
    });
    await app.register(tenantWhiteLabelRoutes, {
      service: options.database.tenantWhiteLabel,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  }
  if (options.database.tenantSubscription !== undefined) {
    await app.register(tenantSubscriptionRoutes, {
      service: options.database.tenantSubscription,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
      ...(options.database.platformBilling
        ? { billingService: options.database.platformBilling }
        : {}),
    });
  }
  if (options.database.publicBooking !== undefined) {
    await app.register(publicBookingRoutes, { service: options.database.publicBooking });
  }
  if (options.database.tenantPaymentOptions !== undefined) {
    await app.register(publicTenantPaymentOptionsRoutes, {
      service: options.database.tenantPaymentOptions,
    });
  }
  if (
    options.database.customerAuth !== undefined &&
    options.database.customerProfile !== undefined
  ) {
    await app.register(customerAuthRoutes, {
      service: options.database.customerAuth,
      profileService: options.database.customerProfile,
      googleAuth,
      ...(options.database.customerPhotos === undefined
        ? {}
        : { photoService: options.database.customerPhotos }),
      cookieName: 'customer_session',
      cookieSecure: options.environment.AUTH_COOKIE_SECURE,
      sessionTtlHours: options.environment.AUTH_SESSION_TTL_HOURS,
    });
    if (options.database.appointments !== undefined) {
      await app.register(customerAppointmentsRoutes, {
        service: options.database.appointments,
        authService: options.database.customerAuth,
        cookieName: 'customer_session',
      });
    }
    if (
      options.database.treatmentPlans !== undefined &&
      options.database.appointments !== undefined
    ) {
      await app.register(customerTreatmentPlanRoutes, {
        service: options.database.treatmentPlans,
        appointments: options.database.appointments,
        authService: options.database.customerAuth,
        cookieName: 'customer_session',
        ...(options.database.treatmentPlanNotifications === undefined
          ? {}
          : { notifications: options.database.treatmentPlanNotifications }),
      });
    }
    if (options.database.customerFavorites !== undefined) {
      await app.register(customerFavoriteRoutes, {
        service: options.database.customerFavorites,
        authService: options.database.customerAuth,
        cookieName: 'customer_session',
      });
    }
    if (options.database.appointmentReviews !== undefined) {
      await app.register(customerReviewsRoutes, {
        service: options.database.appointmentReviews,
        authService: options.database.customerAuth,
        cookieName: 'customer_session',
      });
    }
    if (options.database.loyalty !== undefined) {
      await app.register(customerLoyaltyRoutes, {
        service: options.database.loyalty,
        authService: options.database.customerAuth,
        cookieName: 'customer_session',
      });
    }
    if (options.database.pushSubscriptions !== undefined) {
      await app.register(pushSubscriptionRoutes, {
        service: options.database.pushSubscriptions,
        authService: options.database.customerAuth,
        cookieName: 'customer_session',
        vapidPublicKey: options.database.vapidPublicKey ?? null,
      });
    }
  }
  if (options.database.services !== undefined) {
    await app.register(serviceRoutes, {
      service: options.database.services,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  }
  if (options.database.serviceVariations !== undefined) {
    await app.register(serviceVariationRoutes, {
      service: options.database.serviceVariations,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  }
  if (options.database.combos !== undefined) {
    await app.register(comboRoutes, {
      service: options.database.combos,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  }
  if (options.database.availability !== undefined) {
    await app.register(availabilityRoutes, {
      service: options.database.availability,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  }
  if (options.database.appointments !== undefined)
    await app.register(appointmentRoutes, {
      service: options.database.appointments,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
      ...(options.database.appointmentNotifications === undefined
        ? {}
        : { notifications: options.database.appointmentNotifications }),
    });
  if (
    options.database.treatmentPlans !== undefined &&
    options.database.professionals !== undefined &&
    options.database.appointments !== undefined
  )
    await app.register(treatmentPlanRoutes, {
      service: options.database.treatmentPlans,
      appointments: options.database.appointments,
      professionals: options.database.professionals,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
      ...(options.database.treatmentPlanNotifications === undefined
        ? {}
        : { notifications: options.database.treatmentPlanNotifications }),
    });
  if (options.database.appointmentWaitlists !== undefined)
    await app.register(appointmentWaitlistRoutes, {
      service: options.database.appointmentWaitlists,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (options.database.payments !== undefined)
    await app.register(paymentRoutes, {
      service: options.database.payments,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (options.database.paymentMethods !== undefined)
    await app.register(paymentMethodRoutes, {
      service: options.database.paymentMethods,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (options.database.cashRegisters !== undefined)
    await app.register(cashRegisterRoutes, {
      service: options.database.cashRegisters,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (options.database.receipts !== undefined)
    await app.register(receiptRoutes, {
      service: options.database.receipts,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (options.database.commissions !== undefined)
    await app.register(commissionRoutes, {
      service: options.database.commissions,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (options.database.coupons !== undefined)
    await app.register(couponRoutes, {
      service: options.database.coupons,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (options.database.loyalty !== undefined)
    await app.register(loyaltyRoutes, {
      service: options.database.loyalty,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (options.database.collectionRules !== undefined)
    await app.register(collectionRuleRoutes, {
      service: options.database.collectionRules,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (options.database.debts !== undefined)
    await app.register(debtRoutes, {
      service: options.database.debts,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (options.database.paymentPromises !== undefined)
    await app.register(paymentPromiseRoutes, {
      service: options.database.paymentPromises,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (options.database.collectionAttempts !== undefined)
    await app.register(collectionAttemptRoutes, {
      service: options.database.collectionAttempts,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (options.database.financialClosings !== undefined)
    await app.register(financialClosingRoutes, {
      service: options.database.financialClosings,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (options.database.delinquency !== undefined)
    await app.register(delinquencyRoutes, {
      service: options.database.delinquency,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (options.database.financialReports !== undefined)
    await app.register(financialReportRoutes, {
      service: options.database.financialReports,
      ...(options.database.financeOverview === undefined
        ? {}
        : { overview: options.database.financeOverview }),
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (options.database.paymentGateway !== undefined) {
    await app.register(paymentGatewayRoutes, {
      service: options.database.paymentGateway,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
    await app.register(paymentGatewayWebhookRoutes, {
      service: options.database.paymentGateway,
    });
  }
  if (options.database.tenantPaymentOptions !== undefined) {
    await app.register(tenantPaymentOptionsRoutes, {
      service: options.database.tenantPaymentOptions,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  }
  if (options.database.notifications !== undefined)
    await app.register(notificationRoutes, {
      service: options.database.notifications,
      ...(options.database.notificationCampaigns === undefined
        ? {}
        : { campaigns: options.database.notificationCampaigns }),
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (options.database.notificationTemplates !== undefined)
    await app.register(notificationTemplateRoutes, {
      service: options.database.notificationTemplates,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (options.database.appointmentReminderConfig !== undefined)
    await app.register(appointmentReminderConfigRoutes, {
      service: options.database.appointmentReminderConfig,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (options.database.automations !== undefined)
    await app.register(automationRoutes, {
      service: options.database.automations,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (options.database.appointmentOperations !== undefined)
    await app.register(appointmentOperationsRoutes, {
      service: options.database.appointmentOperations,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (options.database.prospecting !== undefined)
    await app.register(registerProspectingRoutes, {
      service: options.database.prospecting,
      platformService: options.database.platform!,
      authService: authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
      audienceService: options.database.prospectingAudience!,
      repository: options.database.prospectingRepository!,
    });
  if (options.database.prospecting !== undefined)
    await app.register(registerProspectingOperationalRoutes, {
      platformService: options.database.platform!,
      authService: authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (options.database.prospectingWhatsAppConfig !== undefined)
    await app.register(prospectingWhatsAppConfigRoutes, {
      service: options.database.prospectingWhatsAppConfig,
    });
  if (options.database.customerRecovery !== undefined)
    await app.register(customerRecoveryRoutes, {
      service: options.database.customerRecovery,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (options.database.customers !== undefined)
    await app.register(customerRoutes, {
      service: options.database.customers,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  await app.register(customerMembershipRoutes, {
    authService,
    client: options.database.client,
  });
  await app.register(customerMembershipChargeRoutes, {
    authService,
    client: options.database.client,
  });
  await app.register(customerMembershipChargePayLocalRoutes, {
    authService,
    client: options.database.client,
  });
  await app.register(customerMembershipPaymentRoutes, {
    authService,
    client: options.database.client,
  });
  await app.register(customerMembershipBenefitBalanceRoutes, {
    authService,
    client: options.database.client,
  });
  await app.register(customerMembershipPlanRoutes, {
    authService,
    client: options.database.client,
  });
  await app.register(customerMembershipPlanBenefitRoutes, {
    authService,
    client: options.database.client,
  });
  if (options.database.serviceCategories !== undefined) {
    await app.register(serviceCategoryRoutes, {
      service: options.database.serviceCategories,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  }
  if (options.database.products !== undefined) {
    await app.register(productRoutes, {
      service: options.database.products,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  }
  if (options.database.stockMovements !== undefined) {
    await app.register(stockMovementRoutes, {
      service: options.database.stockMovements,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  }
  if (options.database.productSales !== undefined) {
    await app.register(productSaleRoutes, {
      service: options.database.productSales,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  }
  if (options.database.professionals !== undefined)
    await app.register(professionalRoutes, {
      service: options.database.professionals,
      authService,
      passwords: passwordService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (
    options.database.professionals !== undefined &&
    options.database.appointments !== undefined &&
    options.database.professionalSchedules !== undefined &&
    options.database.professionalUnavailabilities !== undefined &&
    options.database.professionalServices !== undefined &&
    options.database.availability !== undefined
  )
    await app.register(professionalSelfRoutes, {
      professionals: options.database.professionals,
      appointments: options.database.appointments,
      schedules: options.database.professionalSchedules,
      unavailabilities: options.database.professionalUnavailabilities,
      professionalServices: options.database.professionalServices,
      availability: options.database.availability,
      passwords: passwordService,
      ...(options.database.commissions === undefined
        ? {}
        : { commissions: options.database.commissions }),
      ...(options.database.payments === undefined ? {} : { payments: options.database.payments }),
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (options.database.professionalServices !== undefined)
    await app.register(professionalServiceRoutes, {
      service: options.database.professionalServices,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (options.database.professionalUnits !== undefined)
    await app.register(professionalUnitRoutes, {
      service: options.database.professionalUnits,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (options.database.professionalSchedules !== undefined)
    await app.register(professionalScheduleRoutes, {
      service: options.database.professionalSchedules,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  if (options.database.professionalUnavailabilities !== undefined)
    await app.register(professionalUnavailabilityRoutes, {
      service: options.database.professionalUnavailabilities,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      client: options.database.client,
    });
  await app.register(membershipRoutes, {
    service: authService,
    cookieName: options.environment.AUTH_COOKIE_NAME,
    client: options.database.client,
  });
  if (options.database.platform !== undefined) {
    if (options.database.directory !== undefined) {
      const directoryLocationConfigService = new DirectoryLocationConfigService(
        options.database.client,
        options.environment.GEOAPIFY_API_KEY,
        options.environment.PAYMENT_GATEWAY_ENCRYPTION_KEY,
      );
      app.decorate('directoryLocationConfigService', directoryLocationConfigService);

      const locationService = new DirectoryLocationService(options.database.client, {
        geoapifyApiKeyProvider: () => directoryLocationConfigService.getGeoapifyApiKey(),
        localMinResults: options.environment.DIRECTORY_LOCAL_MIN_RESULTS,
      });

      await app.register(publicDirectoryRoutes, {
        service: options.database.directory,
        locationService,
        ...(options.environment.INDEXNOW_KEY === undefined
          ? {}
          : { indexNowKey: options.environment.INDEXNOW_KEY }),
      });
      await app.register(directoryRoutes, {
        service: options.database.directory,
        locationService,
        platformService: options.database.platform,
        authService,
        cookieName: options.environment.AUTH_COOKIE_NAME,
        ...(options.database.directorySeo === undefined
          ? {}
          : { seo: options.database.directorySeo }),
      });
    }
    if (options.database.commercialPolicy !== undefined) {
      await app.register(publicCommercialRoutes, {
        service: options.database.platform,
        commercialPolicyService: options.database.commercialPolicy,
      });
    }
    await app.register(platformRoutes, {
      service: options.database.platform,
      authService,
      passwordService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      ...(options.database.commercialPolicy === undefined
        ? {}
        : { commercialPolicyService: options.database.commercialPolicy }),
      ...(options.database.platformBilling
        ? { billingService: options.database.platformBilling }
        : {}),
      ...(options.database.integrations
        ? { integrationsService: options.database.integrations }
        : {}),
      ...(options.database.whatsappProvisioning
        ? { whatsappProvisioningService: options.database.whatsappProvisioning }
        : {}),
      ...(options.database.tenantWhiteLabel
        ? { whiteLabelService: options.database.tenantWhiteLabel }
        : {}),
      ...(options.database.services ? { serviceService: options.database.services } : {}),
      ...(options.database.serviceCategories
        ? { serviceCategoryService: options.database.serviceCategories }
        : {}),
      ...(options.database.professionals
        ? { professionalService: options.database.professionals }
        : {}),
      ...(options.database.professionalUnits
        ? { professionalUnitLinkService: options.database.professionalUnits }
        : {}),
      ...(options.database.businessUnitOperatingHours
        ? { businessUnitOperatingHoursService: options.database.businessUnitOperatingHours }
        : {}),
      ...(options.database.professionalSchedules
        ? { professionalScheduleService: options.database.professionalSchedules }
        : {}),
      ...(options.database.professionalUnavailabilities
        ? { professionalUnavailabilityService: options.database.professionalUnavailabilities }
        : {}),
      ...(options.database.businessUnitDateOverrides
        ? { businessUnitDateOverridesService: options.database.businessUnitDateOverrides }
        : {}),
      ...(options.database.combos
        ? { comboService: options.database.combos }
        : {}),
      tenantService,
    });
  }
  if (options.database.platformBilling)
    await app.register(platformBillingWebhookRoutes, { service: options.database.platformBilling });
  if (options.database.wapiConfig && options.database.platform)
    await app.register(wapiConfigRoutes, {
      wapiConfigService: options.database.wapiConfig,
      platformService: options.database.platform,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
    });

  return app;
}
