import {
  type AvailabilityQuery,
  type CreatePublicBookingRequest,
  PublicBookingConfirmationSchema,
  PublicServiceProfessionalsResponseSchema,
  PublicProfessionalServicesResponseSchema,
} from '@plataforma/shared';

import { AppError } from '../../errors/AppError.js';
import { type AppointmentService } from '../appointments/appointment.service.js';
import { type AvailabilityService } from '../calendar/availability.service.js';
import { type CustomerService } from '../customers/customer.service.js';
import { type AppointmentNotificationService } from '../notifications/appointment-notification.service.js';
import { type ProfessionalServiceLinkService } from '../professionals/professional-service.service.js';
import { type TenantWhiteLabelRepository } from '../tenants/tenant-white-label.repository.js';
import { type TenantWhiteLabelService } from '../tenants/tenant-white-label.service.js';

function tenantNotFound(): AppError {
  return new AppError({
    code: 'PUBLIC_TENANT_NOT_FOUND',
    message: 'Estabelecimento n\u00e3o encontrado.',
    statusCode: 404,
  });
}

export class PublicBookingService {
  public constructor(
    private readonly tenants: TenantWhiteLabelRepository,
    private readonly whiteLabel: TenantWhiteLabelService,
    private readonly professionalServices: ProfessionalServiceLinkService,
    private readonly customers: CustomerService,
    private readonly appointments: AppointmentService,
    private readonly slots: AvailabilityService,
    private readonly notifications?: AppointmentNotificationService,
  ) {}

  private async resolveTenant(slug: string) {
    const tenant = await this.tenants.findActiveTenantBySlug(slug);
    if (tenant === null) throw tenantNotFound();
    return tenant;
  }

  public async professionalsForService(slug: string, servicePublicId: string) {
    const tenant = await this.resolveTenant(slug);
    const [links, site] = await Promise.all([
      this.professionalServices.listService(tenant.id, servicePublicId),
      this.whiteLabel.publicSite(slug),
    ]);
    const eligible = new Set(
      links.items.filter((link) => link.active).map((link) => link.professionalPublicId),
    );
    return PublicServiceProfessionalsResponseSchema.parse({
      professionals: site.professionals
        .filter((professional) => eligible.has(professional.publicId))
        .map((professional) => ({
          publicId: professional.publicId,
          name: professional.name,
          bio: professional.bio,
          photoUrl: professional.photoUrl,
        })),
    });
  }

  public async servicesForProfessional(slug: string, professionalPublicId: string) {
    const tenant = await this.resolveTenant(slug);
    const [links, site] = await Promise.all([
      this.professionalServices.listProfessional(tenant.id, professionalPublicId),
      this.whiteLabel.publicSite(slug),
    ]);
    const eligible = new Set(
      links.items.filter((link) => link.active).map((link) => link.servicePublicId),
    );

    // Get services for professional
    const services = site.services
      .filter((service) => eligible.has(service.publicId))
      .map((service) => ({
        publicId: service.publicId,
        name: service.name,
        description: service.description,
        imageUrl: service.imageUrl,
        iconKey: service.iconKey,
        priceCents: service.priceCents,
        pricingMode: service.pricingMode,
        quoteNotice: service.quoteNotice,
        durationMinutes: service.durationMinutes,
      }));

    // Get eligible combos: professional must have ALL services in combo
    // (site.combos already filtered to active only by whiteLabel.publicSite)
    const combos = site.combos.filter((combo) =>
      // Professional must have all services in combo
      combo.items.every((item) => eligible.has(item.servicePublicId)),
    )
      .map((combo) => ({
        publicId: combo.publicId,
        name: combo.name,
        description: combo.description,
        imageAlt: combo.imageAlt,
        imageUrl: combo.imageUrl,
        priceCents: combo.priceCents,
        sortOrder: combo.sortOrder,
        items: combo.items,
        durationMinutes: combo.durationMinutes,
      }));

    return PublicProfessionalServicesResponseSchema.parse({
      services,
      combos,
    });
  }

  public async availability(slug: string, query: AvailabilityQuery) {
    const tenant = await this.resolveTenant(slug);
    return this.slots.available(tenant.id, query);
  }

  public async createBooking(slug: string, input: CreatePublicBookingRequest) {
    const tenant = await this.resolveTenant(slug);
    const customer = await this.customers.identifyOrCreatePublic(tenant.id, {
      name: input.customer.name,
      phone: input.customer.phone ?? null,
      email: input.customer.email ?? null,
    });
    const appointment = await this.appointments.create(
      tenant.id,
      {
        customerPublicId: customer.publicId,
        professionalPublicId: input.professionalPublicId,
        servicePublicId: input.servicePublicId,
        unitPublicId: input.unitPublicId ?? undefined,
        startsAt: input.startsAt,
        notes: input.notes ?? undefined,
        source: 'PUBLIC_BOOKING',
      },
      { userId: null, sessionId: null },
    );
    // O agendamento pelo site público notifica o cliente pelo mesmo caminho da
    // criação interna; falhar aqui não pode desfazer um agendamento já criado.
    try {
      await this.notifications?.notifyBookingConfirmed(tenant.id, appointment);
    } catch {
      /* a fila de notificações registra o próprio erro */
    }

    return PublicBookingConfirmationSchema.parse({
      protocol: appointment.protocol,
      appointmentPublicId: appointment.publicId,
      status: appointment.status,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      serviceName: appointment.serviceName,
      professionalName: appointment.professionalName,
      unitName: appointment.unitName,
      customerName: appointment.customerName,
    });
  }
}
