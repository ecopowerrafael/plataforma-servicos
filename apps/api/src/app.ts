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
import { appointmentRoutes } from './modules/appointments/appointment.routes.js';
import { appointmentWaitlistRoutes } from './modules/appointments/appointment-waitlist.routes.js';
import { customerAppointmentsRoutes } from './modules/appointments/customer-appointments.routes.js';
import { customerReviewsRoutes } from './modules/appointments/customer-reviews.routes.js';
import {
  internalIdentityRoutes,
  protectedAuthRoutes,
  publicAuthRoutes,
} from './modules/auth/auth.routes.js';
import { AuthService } from './modules/auth/auth.service.js';
import { membershipRoutes } from './modules/auth/membership.routes.js';
import {
  type AccountMessageDelivery,
  UnconfiguredAccountMessageDelivery,
} from './modules/auth/message-delivery.js';
import { PasswordService } from './modules/auth/password.service.js';
import { publicBookingRoutes } from './modules/booking/public-booking.routes.js';
import { availabilityRoutes } from './modules/calendar/availability.routes.js';
import { customerAuthRoutes } from './modules/customers/customer-auth.routes.js';
import { customerFavoriteRoutes } from './modules/customers/customer-favorite.routes.js';
import { customerRoutes } from './modules/customers/customer.routes.js';
import { notificationTemplateRoutes } from './modules/notifications/notification-template.routes.js';
import { notificationRoutes } from './modules/notifications/notification.routes.js';
import { pushSubscriptionRoutes } from './modules/notifications/push-subscription.routes.js';
import { platformRoutes } from './modules/platform/platform.routes.js';
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
import { tenantSubscriptionRoutes } from './modules/tenants/tenant-subscription.routes.js';
import {
  publicTenantWhiteLabelRoutes,
  tenantWhiteLabelRoutes,
} from './modules/tenants/tenant-white-label.routes.js';
import { tenantRoutes } from './modules/tenants/tenant.routes.js';
import { TenantService } from './modules/tenants/tenant.service.js';
import { databasePlugin } from './plugins/database.js';
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
  registerErrorHandlers(baseApp);
  const app = baseApp.withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

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
  await app.register(technicalRoutes);
  const tenantService = new TenantService(options.database.tenants);
  const passwordService = new PasswordService({
    memoryCost: options.environment.PASSWORD_ARGON2_MEMORY_COST,
    timeCost: options.environment.PASSWORD_ARGON2_TIME_COST,
    parallelism: options.environment.PASSWORD_ARGON2_PARALLELISM,
  });
  const authService = await AuthService.create(
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
  const authRouteOptions = {
    service: authService,
    cookieName: options.environment.AUTH_COOKIE_NAME,
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
    ...(options.database.tenantExperience === undefined
      ? {}
      : { experience: options.database.tenantExperience }),
  });
  if (options.database.businessUnitOperatingHours !== undefined) {
    await app.register(businessUnitOperatingHoursRoutes, {
      service: options.database.businessUnitOperatingHours,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
    });
  }
  if (options.database.businessUnitDateOverrides !== undefined) {
    await app.register(businessUnitDateOverridesRoutes, {
      service: options.database.businessUnitDateOverrides,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
    });
  }
  if (options.database.tenantWhiteLabel !== undefined) {
    await app.register(publicTenantWhiteLabelRoutes, {
      service: options.database.tenantWhiteLabel,
    });
    await app.register(tenantWhiteLabelRoutes, {
      service: options.database.tenantWhiteLabel,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
    });
  }
  if (options.database.tenantSubscription !== undefined) {
    await app.register(tenantSubscriptionRoutes, {
      service: options.database.tenantSubscription,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
    });
  }
  if (options.database.publicBooking !== undefined) {
    await app.register(publicBookingRoutes, { service: options.database.publicBooking });
  }
  if (
    options.database.customerAuth !== undefined &&
    options.database.customerProfile !== undefined
  ) {
    await app.register(customerAuthRoutes, {
      service: options.database.customerAuth,
      profileService: options.database.customerProfile,
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
    });
  }
  if (options.database.serviceVariations !== undefined) {
    await app.register(serviceVariationRoutes, {
      service: options.database.serviceVariations,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
    });
  }
  if (options.database.combos !== undefined) {
    await app.register(comboRoutes, {
      service: options.database.combos,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
    });
  }
  if (options.database.availability !== undefined) {
    await app.register(availabilityRoutes, {
      service: options.database.availability,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
    });
  }
  if (options.database.appointments !== undefined)
    await app.register(appointmentRoutes, {
      service: options.database.appointments,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
      ...(options.database.appointmentNotifications === undefined
        ? {}
        : { notifications: options.database.appointmentNotifications }),
    });
  if (options.database.appointmentWaitlists !== undefined)
    await app.register(appointmentWaitlistRoutes, {
      service: options.database.appointmentWaitlists,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
    });
  if (options.database.notifications !== undefined)
    await app.register(notificationRoutes, {
      service: options.database.notifications,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
    });
  if (options.database.notificationTemplates !== undefined)
    await app.register(notificationTemplateRoutes, {
      service: options.database.notificationTemplates,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
    });
  if (options.database.appointmentOperations !== undefined)
    await app.register(appointmentOperationsRoutes, {
      service: options.database.appointmentOperations,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
    });
  if (options.database.customers !== undefined)
    await app.register(customerRoutes, {
      service: options.database.customers,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
    });
  if (options.database.serviceCategories !== undefined) {
    await app.register(serviceCategoryRoutes, {
      service: options.database.serviceCategories,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
    });
  }
  if (options.database.professionals !== undefined)
    await app.register(professionalRoutes, {
      service: options.database.professionals,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
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
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
    });
  if (options.database.professionalServices !== undefined)
    await app.register(professionalServiceRoutes, {
      service: options.database.professionalServices,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
    });
  if (options.database.professionalUnits !== undefined)
    await app.register(professionalUnitRoutes, {
      service: options.database.professionalUnits,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
    });
  if (options.database.professionalSchedules !== undefined)
    await app.register(professionalScheduleRoutes, {
      service: options.database.professionalSchedules,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
    });
  if (options.database.professionalUnavailabilities !== undefined)
    await app.register(professionalUnavailabilityRoutes, {
      service: options.database.professionalUnavailabilities,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
    });
  await app.register(membershipRoutes, {
    service: authService,
    cookieName: options.environment.AUTH_COOKIE_NAME,
  });
  if (options.database.platform !== undefined) {
    await app.register(platformRoutes, {
      service: options.database.platform,
      authService,
      cookieName: options.environment.AUTH_COOKIE_NAME,
    });
  }

  return app;
}
