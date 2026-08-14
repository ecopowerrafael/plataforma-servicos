import { type WhatsAppDelivery, type WhatsAppInteractiveButton } from './integration-delivery.js';
import { type IntegrationRepository } from './integration.repository.js';
import { routeAction } from './whatsapp-action-router.js';
import {
  BOOKING_ACTIONS,
  conversationExpiresAt,
  conversationIsUsable,
  greetingMessage,
  MAIN_MENU_ACTIONS,
} from './whatsapp-assistant.js';
import { type NormalizedWhatsAppEvent } from './whatsapp-inbound.js';
import { type AppointmentService } from '../appointments/appointment.service.js';
import { type AvailabilityService } from '../calendar/availability.service.js';
import { type CustomerService } from '../customers/customer.service.js';
import { formatAppointmentDate, formatAppointmentTime } from '../notifications/appointment-notification.service.js';
import { type TenantPaymentOptionsService } from '../payments/gateway/tenant-payment-options.service.js';
import { type PaymentService } from '../payments/payment.service.js';
import { type ProfessionalServiceLinkService } from '../professionals/professional-service.service.js';
import { type TenantWhiteLabelService } from '../tenants/tenant-white-label.service.js';

/** Motivo pelo qual o assistente não respondeu — usado só em log/diagnóstico. */
export type AssistantSkipReason =
  | 'NOT_A_CUSTOMER_MESSAGE'
  | 'FROM_ME'
  | 'GROUP'
  | 'NO_PHONE'
  | 'NOT_ENTITLED'
  | 'HUMAN_SUPPORT'
  | 'DELIVERY_UNAVAILABLE';

export interface AssistantResult {
  replied: boolean;
  reason?: AssistantSkipReason;
  conversationPublicId?: string;
}

const menuButtons: WhatsAppInteractiveButton[] = MAIN_MENU_ACTIONS.map((action) => ({
  buttonId: action.actionId,
  label: action.label,
}));
const menuActionIds = MAIN_MENU_ACTIONS.map((action) => action.actionId);

const appointmentPublicIdFrom = (context: unknown): string | null => {
  if (context === null || typeof context !== 'object' || Array.isArray(context)) return null;
  const value = (context as Record<string, unknown>).appointmentPublicId;
  return typeof value === 'string' && value.trim() !== '' ? value : null;
};

const lastCanceledAppointmentPublicIdFrom = (context: unknown): string | null => {
  if (context === null || typeof context !== 'object' || Array.isArray(context)) return null;
  const value = (context as Record<string, unknown>).lastCanceledAppointmentPublicId;
  return typeof value === 'string' && value.trim() !== '' ? value : null;
};

const contextString = (context: unknown, key: string): string | null => {
  if (context === null || typeof context !== 'object' || Array.isArray(context)) return null;
  const value = (context as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
};

const pendingAppointmentActionFrom = (context: unknown): 'CANCEL' | 'RESCHEDULE' | null => {
  const value = contextString(context, 'pendingAppointmentAction');
  return value === 'CANCEL' || value === 'RESCHEDULE' ? value : null;
};

const localDate = (date: Date, timezone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

const followingDates = (timezone: string, count: number) => {
  const dates: string[] = [];
  const first = new Date(`${localDate(new Date(), timezone)}T12:00:00.000Z`);
  for (let offset = 1; offset <= count; offset += 1) {
    const date = new Date(first);
    date.setUTCDate(date.getUTCDate() + offset);
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
};

/**
 * Assistente do WhatsApp: abre a sessão, saúda e apresenta o menu principal.
 * Nenhuma funcionalidade de agenda é executada aqui — o roteador apenas
 * reconhece a ação escolhida.
 */
export class WhatsAppAssistantService {
  public constructor(
    private readonly repository: IntegrationRepository,
    private readonly delivery: WhatsAppDelivery | undefined,
    private readonly appointments?: AppointmentService,
    private readonly availability?: AvailabilityService,
    private readonly tenantWhiteLabel?: TenantWhiteLabelService,
    private readonly professionalServices?: ProfessionalServiceLinkService,
    private readonly customers?: CustomerService,
    private readonly paymentOptions?: TenantPaymentOptionsService,
    private readonly payments?: PaymentService,
  ) {}

  /**
   * Só mensagens do cliente movimentam o assistente. Eventos de status e as
   * nossas próprias mensagens são ignorados, o que evita o laço de uma resposta
   * disparar outra.
   */
  public async handleInbound(input: {
    tenantId: bigint;
    instanceId: string;
    event: NormalizedWhatsAppEvent;
    customerId: bigint | null;
    actionId: string | null;
    appointmentPublicId: string | null;
    entitled: boolean;
  }): Promise<AssistantResult> {
    const { event } = input;
    if (event.eventType !== 'MESSAGE_RECEIVED' && event.eventType !== 'MESSAGE_ACTION')
      return { replied: false, reason: 'NOT_A_CUSTOMER_MESSAGE' };
    if (event.fromMe) return { replied: false, reason: 'FROM_ME' };
    if (event.isGroup) return { replied: false, reason: 'GROUP' };
    if (event.phone === null) return { replied: false, reason: 'NO_PHONE' };
    // Sem o recurso no plano o webhook continua sendo persistido, mas a
    // automação não roda e nada é apagado.
    if (!input.entitled) return { replied: false, reason: 'NOT_ENTITLED' };
    if (this.delivery === undefined) return { replied: false, reason: 'DELIVERY_UNAVAILABLE' };

    const now = new Date();
    const phone = event.phone;
    const existing = await this.repository.conversationFor(input.tenantId, phone);

    if (existing === null || !conversationIsUsable(existing, now)) {
      if (existing !== null && existing.status !== 'CLOSED')
        await this.repository.closeConversation(existing.id);
      const conversation = await this.repository.createConversation({
        tenantId: input.tenantId,
        customerId: input.customerId,
        phone,
        lastInboundAt: now,
        expiresAt: conversationExpiresAt(now),
      });
      if (input.appointmentPublicId === null) {
        await this.sendGreetingWithMenu(input, phone, conversation.id);
        return { replied: true, conversationPublicId: conversation.publicId };
      }
      await this.repository.updateConversation(conversation.id, {
        context: { appointmentPublicId: input.appointmentPublicId },
      });
      if (input.actionId === 'BOOKING_CONFIRM')
        await this.confirmAppointment(
          input,
          { ...conversation, context: { appointmentPublicId: input.appointmentPublicId } },
          phone,
          true,
        );
      else if (input.actionId === 'BOOKING_RESCHEDULE')
        await this.startReschedule(
          input,
          { ...conversation, context: { appointmentPublicId: input.appointmentPublicId } },
          phone,
        );
      return { replied: true, conversationPublicId: conversation.publicId };
    }

    const conversation = existing;
    await this.repository.updateConversation(conversation.id, {
      lastInboundAt: now,
      expiresAt: conversationExpiresAt(now),
      ...(conversation.customerId === null && input.customerId !== null
        ? { customerId: input.customerId }
        : {}),
      ...(input.appointmentPublicId === null ? {} : { context: { appointmentPublicId: input.appointmentPublicId } }),
    });

    if (input.appointmentPublicId !== null && input.actionId === 'BOOKING_CONFIRM') {
      await this.confirmAppointment(
        input,
        { ...conversation, context: { appointmentPublicId: input.appointmentPublicId } },
        phone,
        true,
      );
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.appointmentPublicId !== null && input.actionId === 'BOOKING_RESCHEDULE') {
      await this.startReschedule(
        input,
        { ...conversation, context: { appointmentPublicId: input.appointmentPublicId } },
        phone,
      );
      return { replied: true, conversationPublicId: conversation.publicId };
    }

    // Em atendimento humano o inbound é apenas persistido: nada automático sai.
    if (conversation.status === 'HUMAN_SUPPORT')
      return {
        replied: false,
        reason: 'HUMAN_SUPPORT',
        conversationPublicId: conversation.publicId,
      };

    if (conversation.currentFlow === 'BOOKING_CREATE' && conversation.currentStep === 'CUSTOMER_NAME' && event.text !== null) {
      await this.captureBookingCustomerName(input, conversation, phone, event.text);
      return { replied: true, conversationPublicId: conversation.publicId };
    }

    if (input.actionId === 'MAIN_MENU_BOOK') {
      await this.startBookingCreate(input, conversation, phone);
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId === 'MAIN_MENU_CANCEL') {
      await this.startUpcomingAppointmentAction(input, conversation, phone, 'CANCEL');
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId === 'MAIN_MENU_RESCHEDULE') {
      await this.startUpcomingAppointmentAction(input, conversation, phone, 'RESCHEDULE');
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId?.startsWith('BOOKING_CREATE_SERVICE:') === true) {
      await this.selectBookingService(
        input,
        conversation,
        phone,
        input.actionId.slice('BOOKING_CREATE_SERVICE:'.length),
      );
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId?.startsWith('BOOKING_CREATE_SERVICES_PAGE:') === true) {
      const offset = Number(input.actionId.slice('BOOKING_CREATE_SERVICES_PAGE:'.length));
      if (Number.isSafeInteger(offset) && offset >= 0)
        await this.showBookingServices(input, conversation.id, phone, offset);
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId?.startsWith('BOOKING_CREATE_PROFESSIONAL:') === true) {
      await this.selectBookingProfessional(
        input,
        conversation,
        phone,
        input.actionId.slice('BOOKING_CREATE_PROFESSIONAL:'.length),
      );
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId?.startsWith('BOOKING_CREATE_DATE:') === true) {
      await this.selectBookingCreateDate(input, conversation, phone, input.actionId.slice('BOOKING_CREATE_DATE:'.length));
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId?.startsWith('BOOKING_CREATE_TIME:') === true) {
      await this.selectBookingCreateTime(input, conversation, phone, input.actionId.slice('BOOKING_CREATE_TIME:'.length));
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId?.startsWith('BOOKING_CREATE_TIMES_PAGE:') === true) {
      const offset = Number(input.actionId.slice('BOOKING_CREATE_TIMES_PAGE:'.length));
      if (Number.isSafeInteger(offset) && offset >= 0) await this.showBookingCreateTimes(input, conversation, phone, offset);
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId === 'BOOKING_CREATE_CHANGE_DATE') {
      await this.showBookingCreateDates(input, conversation, phone);
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId === 'BOOKING_CREATE_CHANGE_TIME') {
      await this.showBookingCreateTimes(input, conversation, phone, 0);
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId === 'BOOKING_CREATE_CONFIRM') {
      await this.confirmBookingCreate(input, conversation, phone);
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId === 'BOOKING_PAYMENT_PIX') { await this.createBookingPix(input, conversation, phone); return { replied: true, conversationPublicId: conversation.publicId }; }
    if (input.actionId === 'BOOKING_PAYMENT_MERCADO_PAGO') { await this.createBookingMercadoPago(input, conversation, phone); return { replied: true, conversationPublicId: conversation.publicId }; }
    if (input.actionId === 'BOOKING_PAYMENT_LOCAL') { await this.completeLocalPayment(input, conversation, phone); return { replied: true, conversationPublicId: conversation.publicId }; }
    if (input.actionId === 'BOOKING_PAYMENT_STATUS') { await this.showPaymentStatus(input, conversation, phone); return { replied: true, conversationPublicId: conversation.publicId }; }
    if (input.actionId === 'BOOKING_PAYMENT_ABORT') { await this.returnFromPayment(input, conversation, phone); return { replied: true, conversationPublicId: conversation.publicId }; }
    if (input.actionId === 'BOOKING_CREATE_CHANGE_SERVICE') {
      await this.repository.updateConversation(conversation.id, {
        currentFlow: 'BOOKING_CREATE',
        currentStep: 'SERVICE_SELECTION',
        context: {},
      });
      await this.showBookingServices(input, conversation.id, phone);
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId === 'BOOKING_CREATE_ABORT') {
      await this.repository.updateConversation(conversation.id, { currentFlow: 'MAIN_MENU', currentStep: null, context: {} });
      await this.dispatchButtons(input, phone, 'Escolha uma das opções abaixo para continuar.', conversation.id);
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId === 'MAIN_MENU_QUERY') {
      await this.queryAppointments(input, conversation, phone);
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId?.startsWith('BOOKING_SELECT:') === true) {
      await this.showSelectedAppointment(input, conversation, phone, input.actionId.slice('BOOKING_SELECT:'.length));
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId?.startsWith('BOOKING_QUERY_PAGE:') === true) {
      const offset = Number(input.actionId.slice('BOOKING_QUERY_PAGE:'.length));
      if (Number.isSafeInteger(offset) && offset >= 0)
        await (pendingAppointmentActionFrom(conversation.context) === null
          ? this.queryAppointments(input, conversation, phone, offset)
          : this.showUpcomingAppointmentActionSelection(
              input,
              conversation,
              phone,
              pendingAppointmentActionFrom(conversation.context) as 'CANCEL' | 'RESCHEDULE',
              offset,
            ));
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId === 'MAIN_MENU_BACK') {
      await this.repository.updateConversation(conversation.id, {
        currentFlow: 'MAIN_MENU', currentStep: null, context: {},
      });
      await this.dispatchButtons(input, phone, 'Escolha uma das opções abaixo para continuar.', conversation.id);
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId === 'BOOKING_CONFIRM') {
      await this.confirmAppointment(input, conversation, phone);
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId === 'BOOKING_CANCEL') {
      await this.requestCancellation(input, conversation, phone);
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId === 'BOOKING_CANCEL_CONFIRM') {
      await this.cancelAppointment(input, conversation, phone);
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId === 'BOOKING_CANCEL_ABORT') {
      await this.abortCancellation(input, conversation, phone);
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId === 'BOOKING_RESCHEDULE') {
      await this.startReschedule(input, conversation, phone);
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId?.startsWith('BOOKING_RESCHEDULE_DATE:') === true) {
      await this.selectRescheduleDate(
        input,
        conversation,
        phone,
        input.actionId.slice('BOOKING_RESCHEDULE_DATE:'.length),
      );
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId?.startsWith('BOOKING_RESCHEDULE_TIME:') === true) {
      await this.selectRescheduleTime(
        input,
        conversation,
        phone,
        input.actionId.slice('BOOKING_RESCHEDULE_TIME:'.length),
      );
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId?.startsWith('BOOKING_RESCHEDULE_TIMES_PAGE:') === true) {
      const offset = Number(input.actionId.slice('BOOKING_RESCHEDULE_TIMES_PAGE:'.length));
      if (Number.isSafeInteger(offset) && offset >= 0)
        await this.showRescheduleTimes(input, conversation, phone, offset);
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId === 'BOOKING_RESCHEDULE_CONFIRM') {
      await this.confirmReschedule(input, conversation, phone);
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId === 'BOOKING_RESCHEDULE_CHANGE_TIME') {
      await this.changeRescheduleTime(input, conversation, phone);
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId === 'BOOKING_RESCHEDULE_ABORT') {
      await this.abortReschedule(input, conversation, phone);
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    if (input.actionId === 'BOOKING_DIRECTIONS') {
      await this.sendDirections(input, phone, conversation.id);
      return { replied: true, conversationPublicId: conversation.publicId };
    }
    const outcome = routeAction(input.actionId);
    if (outcome.resendMenu) {
      await this.dispatchButtons(input, phone, outcome.reply, conversation.id);
    } else {
      await this.dispatchText(input, phone, outcome.reply, conversation.id);
    }
    if (outcome.nextStatus !== conversation.status)
      await this.repository.updateConversation(conversation.id, { status: outcome.nextStatus });
    return { replied: true, conversationPublicId: conversation.publicId };
  }

  private async queryAppointments(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    conversation: { id: bigint; customerId: bigint | null },
    phone: string,
    offset = 0,
  ): Promise<void> {
    const customerId = conversation.customerId ?? input.customerId;
    if (customerId === null || this.appointments === undefined) {
      await this.dispatchCustomButtons(
        input,
        phone,
        'Não encontrei nenhum cadastro associado a este número.',
        [{ buttonId: 'MAIN_MENU_BACK', label: 'Voltar ao menu' }],
        conversation.id,
      );
      return;
    }
    const items = (await this.appointments.listUpcomingForCustomer(input.tenantId, customerId)).items;
    if (items.length === 0) {
      await this.dispatchCustomButtons(
        input,
        phone,
        'Você não possui agendamentos futuros neste estabelecimento.',
        [
          { buttonId: 'MAIN_MENU_BOOK', label: 'Agendar horário' },
          { buttonId: 'MAIN_MENU_BACK', label: 'Voltar ao menu' },
        ],
        conversation.id,
      );
      return;
    }
    if (items.length === 1) {
      const appointment = items[0];
      if (appointment !== undefined)
        return this.showAppointment(input, conversation.id, phone, appointment, customerId);
    }
    const tenant = await this.repository.tenantName(input.tenantId);
    const timezone = tenant?.timezone ?? 'UTC';
    const page = items.slice(offset, offset + 4);
    if (page.length === 0) return this.queryAppointments(input, conversation, phone);
    const buttons = page.map((item, index) => ({
      buttonId: `BOOKING_SELECT:${item.publicId}`,
      label: `Agendamento ${String(offset + index + 1)} · ${formatAppointmentDate(item.startsAt, timezone)}`,
    }));
    if (items.length > offset + page.length)
      buttons.push({ buttonId: `BOOKING_QUERY_PAGE:${String(offset + page.length)}`, label: 'Ver próximos' });
    await this.dispatchCustomButtons(
      input,
      phone,
      'Encontrei mais de um agendamento. Qual deseja consultar?',
      buttons,
      conversation.id,
    );
  }

  private async startUpcomingAppointmentAction(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    conversation: { id: bigint; customerId: bigint | null },
    phone: string,
    action: 'CANCEL' | 'RESCHEDULE',
  ): Promise<void> {
    const customerId = conversation.customerId ?? input.customerId;
    if (customerId === null || this.appointments === undefined) {
      await this.dispatchText(
        input,
        phone,
        action === 'CANCEL'
          ? 'Você não possui agendamentos futuros para cancelar.'
          : 'Você não possui agendamentos futuros para reagendar.',
        conversation.id,
      );
      return;
    }
    const items = (await this.appointments.listUpcomingForCustomer(input.tenantId, customerId)).items;
    if (items.length === 0) {
      await this.dispatchText(
        input,
        phone,
        action === 'CANCEL'
          ? 'Você não possui agendamentos futuros para cancelar.'
          : 'Você não possui agendamentos futuros para reagendar.',
        conversation.id,
      );
      return;
    }
    if (items.length === 1) {
      const appointment = items[0];
      if (appointment !== undefined) {
        await this.showAppointment(input, conversation.id, phone, appointment, customerId);
        const selected = { id: conversation.id, customerId, context: { appointmentPublicId: appointment.publicId } };
        if (action === 'CANCEL') await this.requestCancellation(input, selected, phone);
        else await this.startReschedule(input, selected, phone);
      }
      return;
    }
    await this.repository.updateConversation(conversation.id, {
      currentFlow: 'BOOKING_QUERY',
      currentStep: 'APPOINTMENT_SELECTION',
      context: { pendingAppointmentAction: action },
    });
    await this.showUpcomingAppointmentActionSelection(input, conversation, phone, action);
  }

  private async showUpcomingAppointmentActionSelection(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    conversation: { id: bigint; customerId: bigint | null },
    phone: string,
    action: 'CANCEL' | 'RESCHEDULE',
    offset = 0,
  ): Promise<void> {
    const customerId = conversation.customerId ?? input.customerId;
    if (customerId === null || this.appointments === undefined) return;
    const items = (await this.appointments.listUpcomingForCustomer(input.tenantId, customerId)).items;
    const page = items.slice(offset, offset + 4);
    if (page.length === 0) {
      await this.dispatchText(
        input,
        phone,
        action === 'CANCEL'
          ? 'Você não possui agendamentos futuros para cancelar.'
          : 'Você não possui agendamentos futuros para reagendar.',
        conversation.id,
      );
      return;
    }
    const tenant = await this.repository.tenantName(input.tenantId);
    const timezone = tenant?.timezone ?? 'UTC';
    const buttons = page.map((item, index) => ({
      buttonId: `BOOKING_SELECT:${item.publicId}`,
      label: `Agendamento ${String(offset + index + 1)} · ${formatAppointmentDate(item.startsAt, timezone)}`,
    }));
    if (items.length > offset + page.length)
      buttons.push({ buttonId: `BOOKING_QUERY_PAGE:${String(offset + page.length)}`, label: 'Ver próximos' });
    await this.dispatchCustomButtons(
      input,
      phone,
      action === 'CANCEL'
        ? 'Qual agendamento você deseja cancelar?'
        : 'Qual agendamento você deseja reagendar?',
      buttons,
      conversation.id,
    );
  }

  private async openBookingPayment(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    conversationId: bigint,
    phone: string,
    customerId: bigint,
    appointmentPublicId: string,
  ): Promise<void> {
    if (this.paymentOptions === undefined) {
      await this.sendPaymentDetail(input, conversationId, phone, appointmentPublicId);
      return;
    }
    const options = await this.paymentOptions.getAvailableOptionsForAppointment(input.tenantId, appointmentPublicId);
    const methods = [
      options.pixLocalAvailable ? { buttonId: 'BOOKING_PAYMENT_PIX', label: 'PIX' } : null,
      options.mercadoPagoAvailable
        ? { buttonId: 'BOOKING_PAYMENT_MERCADO_PAGO', label: 'Mercado Pago' }
        : null,
      options.payLocalAvailable ? { buttonId: 'BOOKING_PAYMENT_LOCAL', label: 'Pagar no local' } : null,
    ].filter((item): item is { buttonId: string; label: string } => item !== null);
    await this.repository.updateConversation(conversationId, { customerId, currentFlow: 'BOOKING_PAYMENT', currentStep: 'METHOD_SELECTION', context: { appointmentPublicId } });
    if (methods.length === 1 && methods[0]?.buttonId === 'BOOKING_PAYMENT_LOCAL') {
      await this.completeLocalPayment(
        input,
        { id: conversationId, customerId, context: { appointmentPublicId } },
        phone,
      );
      return;
    }
    const value = (Number(options.balanceCents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    await this.dispatchCustomButtons(input, phone, `Seu horário foi reservado.\n\nValor: ${value}\n\nComo deseja pagar?`, methods, conversationId);
  }

  private async createBookingPix(input: { tenantId: bigint; instanceId: string; customerId: bigint | null }, conversation: { id: bigint; customerId: bigint | null; context: unknown }, phone: string): Promise<void> {
    const appointmentPublicId = appointmentPublicIdFrom(conversation.context);
    if (appointmentPublicId === null || this.paymentOptions === undefined) return this.dispatchText(input, phone, 'Pagamento indisponível.', conversation.id);
    if (await this.appointmentForConversation(input, conversation) === null) return this.dispatchText(input, phone, 'O agendamento não está mais disponível.', conversation.id);
    const result = await this.paymentOptions.createPixCharge(input.tenantId, appointmentPublicId, { kind: 'PAYMENT' }, { userId: null, sessionId: null });
    await this.repository.updateConversation(conversation.id, { currentFlow: 'BOOKING_PAYMENT', currentStep: 'PIX_GENERATED', context: { appointmentPublicId, paymentMethod: 'PIX', chargePublicId: result.charge.publicId } });
    await this.dispatchCustomButtons(input, phone, `PIX gerado\n\nValor: ${(Number(result.charge.amountCents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: result.charge.currency })}\n\nCódigo PIX:\n${result.charge.pixCopyPaste ?? ''}`, [{ buttonId: 'BOOKING_PAYMENT_STATUS', label: 'Status do pagamento' }, { buttonId: 'BOOKING_PAYMENT_ABORT', label: 'Ver agendamento' }], conversation.id);
  }

  private async createBookingMercadoPago(input: { tenantId: bigint; instanceId: string; customerId: bigint | null }, conversation: { id: bigint; customerId: bigint | null; context: unknown }, phone: string): Promise<void> {
    const appointmentPublicId = appointmentPublicIdFrom(conversation.context);
    if (appointmentPublicId === null || this.paymentOptions === undefined) return this.dispatchText(input, phone, 'Pagamento indisponível.', conversation.id);
    if (await this.appointmentForConversation(input, conversation) === null) return this.dispatchText(input, phone, 'O agendamento não está mais disponível.', conversation.id);
    const charge = await this.paymentOptions.createMercadoPagoCharge(input.tenantId, appointmentPublicId, { kind: 'PAYMENT' }, { userId: null, sessionId: null });
    await this.repository.updateConversation(conversation.id, { currentFlow: 'BOOKING_PAYMENT', currentStep: 'MERCADO_PAGO_GENERATED', context: { appointmentPublicId, paymentMethod: 'MERCADO_PAGO', chargePublicId: charge.publicId } });
    const copyPaste = charge.pixCopyPaste === null ? '' : `\n\nCódigo PIX:\n${charge.pixCopyPaste}`;
    await this.dispatchCustomButtons(input, phone, `Pagamento online\n\nValor: ${(Number(charge.amountCents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: charge.currency })}${copyPaste}`, [{ buttonId: 'BOOKING_PAYMENT_STATUS', label: 'Status do pagamento' }, { buttonId: 'BOOKING_PAYMENT_ABORT', label: 'Ver agendamento' }], conversation.id);
  }

  private async completeLocalPayment(input: { tenantId: bigint; instanceId: string; customerId: bigint | null }, conversation: { id: bigint; customerId: bigint | null; context: unknown }, phone: string): Promise<void> {
    const id = appointmentPublicIdFrom(conversation.context);
    if (id === null || await this.appointmentForConversation(input, conversation) === null) return this.dispatchText(input, phone, 'O agendamento não está mais disponível.', conversation.id);
    await this.dispatchText(input, phone, 'Pronto ✅\nSeu pagamento será realizado no estabelecimento.', conversation.id);
    await this.sendPaymentDetail(input, conversation.id, phone, id);
  }

  private async showPaymentStatus(input: { tenantId: bigint; instanceId: string; customerId: bigint | null }, conversation: { id: bigint; customerId: bigint | null; context: unknown }, phone: string): Promise<void> {
    const id = appointmentPublicIdFrom(conversation.context);
    if (id === null || this.payments === undefined) return this.dispatchText(input, phone, 'Pagamento indisponível.', conversation.id);
    if (await this.appointmentForConversation(input, conversation) === null) return this.dispatchText(input, phone, 'O agendamento não está mais disponível.', conversation.id);
    const result = await this.payments.listForAppointment(input.tenantId, id);
    await this.dispatchText(input, phone, BigInt(result.summary.totalPaidCents) > 0n ? 'Pagamento confirmado ✅' : 'Seu pagamento ainda está aguardando confirmação.', conversation.id);
  }
  private async returnFromPayment(input: { tenantId: bigint; instanceId: string; customerId: bigint | null }, conversation: { id: bigint; customerId: bigint | null; context: unknown }, phone: string): Promise<void> { const id = appointmentPublicIdFrom(conversation.context); if (id === null) return this.dispatchText(input, phone, 'O agendamento não está mais disponível.', conversation.id); await this.sendPaymentDetail(input, conversation.id, phone, id); }
  private async sendPaymentDetail(input: { tenantId: bigint; instanceId: string; customerId: bigint | null }, conversationId: bigint, phone: string, appointmentPublicId: string): Promise<void> { await this.repository.updateConversation(conversationId, { currentFlow: 'BOOKING_QUERY', currentStep: 'BOOKING_DETAILS', context: { appointmentPublicId } }); await this.dispatchCustomButtons(input, phone, 'Agendamento reservado ✅', [{ buttonId: `BOOKING_SELECT:${appointmentPublicId}`, label: 'Ver agendamento' }, { buttonId: 'BOOKING_PAYMENT_STATUS', label: 'Status do pagamento' }, { buttonId: 'MAIN_MENU_BACK', label: 'Voltar ao menu' }], conversationId); }

  private async startBookingCreate(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    conversation: { id: bigint },
    phone: string,
  ): Promise<void> {
    await this.repository.updateConversation(conversation.id, {
      currentFlow: 'BOOKING_CREATE',
      currentStep: 'SERVICE_SELECTION',
      context: {},
    });
    await this.showBookingServices(input, conversation.id, phone);
  }

  private async showBookingServices(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    conversationId: bigint,
    phone: string,
    offset = 0,
  ): Promise<void> {
    const site = await this.bookingSite(input.tenantId);
    if (!site?.bookingAvailable) {
      await this.dispatchText(input, phone, site?.unavailableMessage ?? 'Agendamento online indisponível no momento.', conversationId);
      return;
    }
    const page = site.services.slice(offset, offset + 4);
    if (page.length === 0) {
      await this.dispatchCustomButtons(input, phone, 'Não encontrei serviços disponíveis para agendamento.', [{ buttonId: 'BOOKING_CREATE_ABORT', label: 'Voltar ao menu' }], conversationId);
      return;
    }
    const tenant = await this.repository.tenantName(input.tenantId);
    const buttons = page.map((service) => ({
      buttonId: `BOOKING_CREATE_SERVICE:${service.publicId}`,
      label: `${service.name} · ${(Number(service.priceCents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: tenant?.currency ?? 'BRL' })}`,
    }));
    if (site.services.length > offset + page.length)
      buttons.push({ buttonId: `BOOKING_CREATE_SERVICES_PAGE:${String(offset + page.length)}`, label: 'Ver mais serviços' });
    await this.dispatchCustomButtons(input, phone, 'Qual serviço você deseja agendar?', buttons, conversationId);
  }

  private async selectBookingService(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    conversation: { id: bigint },
    phone: string,
    servicePublicId: string,
  ): Promise<void> {
    const site = await this.bookingSite(input.tenantId);
    const service = site?.services.find((item) => item.publicId === servicePublicId);
    if (site === null || service === undefined) {
      await this.dispatchText(input, phone, 'Esse serviço não está disponível para agendamento.', conversation.id);
      return;
    }
    const professionals = await this.bookingProfessionals(input.tenantId, servicePublicId, site);
    if (professionals.length === 0) {
      await this.dispatchCustomButtons(
        input,
        phone,
        'Não encontrei profissionais disponíveis para este serviço.',
        [
          { buttonId: 'BOOKING_CREATE_CHANGE_SERVICE', label: 'Escolher outro serviço' },
          { buttonId: 'BOOKING_CREATE_ABORT', label: 'Voltar ao menu' },
        ],
        conversation.id,
      );
      return;
    }
    await this.repository.updateConversation(conversation.id, {
      currentFlow: 'BOOKING_CREATE',
      currentStep: 'PROFESSIONAL_SELECTION',
      context: { servicePublicId },
    });
    await this.dispatchCustomButtons(
      input,
      phone,
      'Com qual profissional você deseja agendar?',
      [
        ...professionals.slice(0, 4).map((professional) => ({
          buttonId: `BOOKING_CREATE_PROFESSIONAL:${professional.publicId}`,
          label: professional.name,
        })),
        { buttonId: 'BOOKING_CREATE_CHANGE_SERVICE', label: 'Escolher outro serviço' },
      ],
      conversation.id,
    );
  }

  private async selectBookingProfessional(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    conversation: { id: bigint; context: unknown },
    phone: string,
    professionalPublicId: string,
  ): Promise<void> {
    const servicePublicId = contextString(conversation.context, 'servicePublicId');
    const site = await this.bookingSite(input.tenantId);
    if (servicePublicId === null || site === null) {
      await this.dispatchText(input, phone, 'Esse profissional não está disponível para este serviço.', conversation.id);
      return;
    }
    const professionals = await this.bookingProfessionals(input.tenantId, servicePublicId, site);
    if (!professionals.some((professional) => professional.publicId === professionalPublicId)) {
      await this.dispatchText(input, phone, 'Esse profissional não está disponível para este serviço.', conversation.id);
      return;
    }
    await this.repository.updateConversation(conversation.id, {
      currentFlow: 'BOOKING_CREATE',
      currentStep: 'PROFESSIONAL_SELECTED',
      context: { servicePublicId, professionalPublicId },
    });
    await this.showBookingCreateDates(input, conversation, phone);
  }

  private async bookingSite(tenantId: bigint) {
    if (this.tenantWhiteLabel === undefined) return null;
    const tenant = await this.repository.tenantSlug(tenantId);
    if (tenant === null) return null;
    try {
      return await this.tenantWhiteLabel.publicSite(tenant.slug);
    } catch {
      return null;
    }
  }

  private async bookingProfessionals(
    tenantId: bigint,
    servicePublicId: string,
    site: NonNullable<Awaited<ReturnType<WhatsAppAssistantService['bookingSite']>>>,
  ) {
    if (this.professionalServices === undefined) return [];
    const links = await this.professionalServices.listService(tenantId, servicePublicId);
    const eligible = new Set(
      links.items.filter((link) => link.active).map((link) => link.professionalPublicId),
    );
    return site.professionals.filter((professional) => eligible.has(professional.publicId));
  }

  private async showBookingCreateDates(input: { tenantId: bigint; instanceId: string; customerId: bigint | null }, conversation: { id: bigint; context: unknown }, phone: string): Promise<void> {
    const context = this.bookingCreateContext(conversation.context);
    if (context === null) return this.dispatchText(input, phone, 'Não foi possível continuar o agendamento.', conversation.id);
    const tenant = await this.repository.tenantName(input.tenantId); const timezone = tenant?.timezone ?? 'UTC';
    const dates = (await Promise.all(followingDates(timezone, 7).map(async (date) => (await this.availableBookingCreateSlots(input.tenantId, context, date)).length > 0 ? date : null))).flatMap((date) => date === null ? [] : [date]).slice(0, 3);
    if (dates.length === 0) return this.dispatchText(input, phone, 'Não encontrei datas disponíveis para agendamento.', conversation.id);
    await this.dispatchCustomButtons(input, phone, 'Escolha uma data para seu agendamento:', [...dates.map((date) => ({ buttonId: `BOOKING_CREATE_DATE:${date}`, label: formatAppointmentDate(`${date}T12:00:00.000Z`, timezone) })), { buttonId: 'BOOKING_CREATE_ABORT', label: 'Voltar ao menu' }], conversation.id);
  }

  private async selectBookingCreateDate(input: { tenantId: bigint; instanceId: string; customerId: bigint | null }, conversation: { id: bigint; context: unknown }, phone: string, date: string): Promise<void> {
    const context = this.bookingCreateContext(conversation.context); if (context === null || !/^\d{4}-\d{2}-\d{2}$/u.test(date) || (await this.availableBookingCreateSlots(input.tenantId, context, date)).length === 0) return this.dispatchText(input, phone, 'Essa data não está disponível para agendamento.', conversation.id);
    await this.repository.updateConversation(conversation.id, { currentFlow: 'BOOKING_CREATE', currentStep: 'DATE_SELECTED', context: { ...context, date } });
    await this.showBookingCreateTimes(input, conversation, phone, 0, { ...context, date });
  }

  private async showBookingCreateTimes(input: { tenantId: bigint; instanceId: string; customerId: bigint | null }, conversation: { id: bigint; context: unknown }, phone: string, offset: number, known?: { servicePublicId: string; professionalPublicId: string; date: string }): Promise<void> {
    const context = known ?? this.bookingCreateContext(conversation.context); if (context?.date === undefined) return this.dispatchText(input, phone, 'Não foi possível continuar o agendamento.', conversation.id);
    const slots = await this.availableBookingCreateSlots(input.tenantId, context, context.date); if (slots.length === 0) return this.dispatchCustomButtons(input, phone, 'Não há mais horários disponíveis para esta data.', [{ buttonId: 'BOOKING_CREATE_CHANGE_DATE', label: 'Escolher outra data' }, { buttonId: 'BOOKING_CREATE_ABORT', label: 'Voltar ao menu' }], conversation.id);
    const tenant = await this.repository.tenantName(input.tenantId); const timezone = tenant?.timezone ?? 'UTC'; const page = slots.slice(offset, offset + 3); const buttons = page.map((slot) => ({ buttonId: `BOOKING_CREATE_TIME:${formatAppointmentTime(slot, timezone)}`, label: formatAppointmentTime(slot, timezone) })); if (slots.length > offset + page.length) buttons.push({ buttonId: `BOOKING_CREATE_TIMES_PAGE:${String(offset + page.length)}`, label: 'Ver próximos' }); buttons.push({ buttonId: 'BOOKING_CREATE_CHANGE_DATE', label: 'Escolher outra data' }); await this.dispatchCustomButtons(input, phone, 'Escolha um horário disponível:', buttons, conversation.id);
  }

  private async selectBookingCreateTime(input: { tenantId: bigint; instanceId: string; customerId: bigint | null }, conversation: { id: bigint; customerId: bigint | null; context: unknown }, phone: string, time: string): Promise<void> {
    const context = this.bookingCreateContext(conversation.context); if (context?.date === undefined) return this.dispatchText(input, phone, 'Esse horário não está disponível.', conversation.id); const tenant = await this.repository.tenantName(input.tenantId); const timezone = tenant?.timezone ?? 'UTC'; if (!(await this.availableBookingCreateSlots(input.tenantId, context, context.date)).some((slot) => formatAppointmentTime(slot, timezone) === time)) return this.dispatchText(input, phone, 'Esse horário não está disponível.', conversation.id);
    const next = { ...context, date: context.date, time }; const customerId = conversation.customerId ?? input.customerId; if (customerId === null) { await this.repository.updateConversation(conversation.id, { currentStep: 'CUSTOMER_NAME', context: next }); await this.dispatchText(input, phone, 'Para concluir seu primeiro agendamento, preciso dos seus dados.\n\nQual é o seu nome?', conversation.id); return; }
    await this.showBookingCreateConfirmation(input, conversation.id, phone, next, customerId);
  }

  private bookingCreateContext(context: unknown): { servicePublicId: string; professionalPublicId: string; date?: string | undefined; time?: string | undefined; customerName?: string | undefined } | null {
    const servicePublicId = contextString(context, 'servicePublicId'); const professionalPublicId = contextString(context, 'professionalPublicId'); if (servicePublicId === null || professionalPublicId === null) return null;
    return { servicePublicId, professionalPublicId, ...(contextString(context, 'date') === null ? {} : { date: contextString(context, 'date') ?? undefined }), ...(contextString(context, 'time') === null ? {} : { time: contextString(context, 'time') ?? undefined }), ...(contextString(context, 'customerName') === null ? {} : { customerName: contextString(context, 'customerName') ?? undefined }) };
  }

  private async availableBookingCreateSlots(tenantId: bigint, context: { servicePublicId: string; professionalPublicId: string }, date: string): Promise<string[]> {
    if (this.availability === undefined) return []; try { const result = await this.availability.available(tenantId, { date, professionalPublicId: context.professionalPublicId, servicePublicId: context.servicePublicId }); return result.slots.filter((slot) => slot.state === 'AVAILABLE').map((slot) => slot.startsAt); } catch { return []; }
  }

  private async captureBookingCustomerName(input: { tenantId: bigint; instanceId: string; customerId: bigint | null }, conversation: { id: bigint; context: unknown }, phone: string, name: string): Promise<void> {
    const context = this.bookingCreateContext(conversation.context); if (context?.date === undefined || context.time === undefined || name.trim().length < 2) { await this.dispatchText(input, phone, 'Informe um nome válido.', conversation.id); return; }
    await this.showBookingCreateConfirmation(input, conversation.id, phone, { ...context, date: context.date, time: context.time, customerName: name.trim() }, null);
  }

  private async showBookingCreateConfirmation(input: { tenantId: bigint; instanceId: string; customerId: bigint | null }, conversationId: bigint, phone: string, context: { servicePublicId: string; professionalPublicId: string; date: string; time: string; customerName?: string | undefined }, customerId: bigint | null): Promise<void> {
    const site = await this.bookingSite(input.tenantId); const service = site?.services.find((item) => item.publicId === context.servicePublicId); const professional = site?.professionals.find((item) => item.publicId === context.professionalPublicId); if (service === undefined || professional === undefined) return this.dispatchText(input, phone, 'Não foi possível continuar o agendamento.', conversationId);
    await this.repository.updateConversation(conversationId, { currentFlow: 'BOOKING_CREATE', currentStep: 'CONFIRMATION', ...(customerId === null ? {} : { customerId }), context }); const tenant = await this.repository.tenantName(input.tenantId); const timezone = tenant?.timezone ?? 'UTC'; const price = (Number(service.priceCents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: tenant?.currency ?? 'BRL' }); await this.dispatchCustomButtons(input, phone, `Confirmar agendamento?\n\n📅 ${formatAppointmentDate(`${context.date}T12:00:00.000Z`, timezone)}\n🕐 ${context.time}\n✂️ ${service.name}\n👤 ${professional.name}\n💰 ${price}`, [{ buttonId: 'BOOKING_CREATE_CONFIRM', label: 'Confirmar agendamento' }, { buttonId: 'BOOKING_CREATE_CHANGE_TIME', label: 'Escolher outro horário' }, { buttonId: 'BOOKING_CREATE_ABORT', label: 'Cancelar' }], conversationId);
  }

  private async confirmBookingCreate(input: { tenantId: bigint; instanceId: string; customerId: bigint | null }, conversation: { id: bigint; customerId: bigint | null; context: unknown }, phone: string): Promise<void> {
    const context = this.bookingCreateContext(conversation.context); if (context?.date === undefined || context.time === undefined || this.appointments === undefined) return this.dispatchText(input, phone, 'Não foi possível continuar o agendamento.', conversation.id);
    const tenant = await this.repository.tenantName(input.tenantId); const timezone = tenant?.timezone ?? 'UTC'; const target = (await this.availableBookingCreateSlots(input.tenantId, context, context.date)).find((slot) => formatAppointmentTime(slot, timezone) === context.time); if (target === undefined) { await this.dispatchText(input, phone, 'Esse horário acabou de ficar indisponível.', conversation.id); await this.showBookingCreateTimes(input, conversation, phone, 0); return; }
    let customerId = conversation.customerId ?? input.customerId; if (customerId === null) { if (this.customers === undefined || context.customerName === undefined) return this.dispatchText(input, phone, 'Não foi possível concluir seus dados.', conversation.id); const customer = await this.customers.identifyOrCreatePublic(input.tenantId, { name: context.customerName, phone }); const stored = await this.repository.client.customer.findFirst({ where: { tenantId: input.tenantId, publicId: customer.publicId }, select: { id: true } }); customerId = stored?.id ?? null; }
    if (customerId === null) return this.dispatchText(input, phone, 'Não foi possível concluir seus dados.', conversation.id); const customer = await this.repository.customerName(customerId); if (customer === null) return this.dispatchText(input, phone, 'Não foi possível concluir seus dados.', conversation.id);
    try { const created = await this.appointments.create(input.tenantId, { customerPublicId: (await this.repository.client.customer.findUnique({ where: { id: customerId }, select: { publicId: true } }))?.publicId ?? '', professionalPublicId: context.professionalPublicId, servicePublicId: context.servicePublicId, startsAt: target, source: 'PUBLIC_BOOKING' }, { userId: null, sessionId: null }); await this.openBookingPayment(input, conversation.id, phone, customerId, created.publicId); } catch { await this.dispatchText(input, phone, 'Esse horário acabou de ficar indisponível.', conversation.id); }
  }

  private async showSelectedAppointment(input: { tenantId: bigint; instanceId: string; customerId: bigint | null }, conversation: { id: bigint; customerId: bigint | null; context?: unknown }, phone: string, publicId: string) {
    const customerId = conversation.customerId ?? input.customerId;
    if (customerId === null || this.appointments === undefined) return;
    try {
      const appointment = await this.appointments.getForCustomer(input.tenantId, customerId, publicId);
      const pendingAction = pendingAppointmentActionFrom(conversation.context);
      await this.showAppointment(input, conversation.id, phone, appointment, customerId);
      if (pendingAction === 'CANCEL')
        await this.requestCancellation(
          input,
          { id: conversation.id, customerId, context: { appointmentPublicId: appointment.publicId } },
          phone,
        );
      if (pendingAction === 'RESCHEDULE')
        await this.startReschedule(
          input,
          { id: conversation.id, customerId, context: { appointmentPublicId: appointment.publicId } },
          phone,
        );
    } catch { await this.dispatchText(input, phone, 'Não encontrei esse agendamento.', conversation.id); }
  }

  private async startReschedule(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    conversation: { id: bigint; customerId: bigint | null; context: unknown },
    phone: string,
  ): Promise<void> {
    const appointment = await this.appointmentForConversation(input, conversation);
    if (appointment === null) {
      await this.dispatchText(input, phone, 'O agendamento não está mais disponível.', conversation.id);
      return;
    }
    if (['CANCELED', 'COMPLETED'].includes(appointment.status)) {
      await this.dispatchText(input, phone, 'Este agendamento não pode mais ser reagendado.', conversation.id);
      return;
    }
    const dates = await this.availableRescheduleDates(input.tenantId, appointment);
    if (dates.length === 0) {
      await this.dispatchCustomButtons(
        input,
        phone,
        'Não encontrei datas disponíveis para reagendamento nos próximos dias.',
        [{ buttonId: 'BOOKING_RESCHEDULE_ABORT', label: 'Voltar ao agendamento' }],
        conversation.id,
      );
      return;
    }
    const tenant = await this.repository.tenantName(input.tenantId);
    const timezone = tenant?.timezone ?? 'UTC';
    await this.dispatchCustomButtons(
      input,
      phone,
      'Escolha uma data para reagendar:',
      [
        ...dates.map((date) => ({
          buttonId: `BOOKING_RESCHEDULE_DATE:${date}`,
          label: formatAppointmentDate(`${date}T12:00:00.000Z`, timezone),
        })),
        { buttonId: 'BOOKING_RESCHEDULE_ABORT', label: 'Voltar ao agendamento' },
      ],
      conversation.id,
    );
  }

  private async selectRescheduleDate(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    conversation: { id: bigint; customerId: bigint | null; context: unknown },
    phone: string,
    date: string,
  ): Promise<void> {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
      await this.dispatchText(input, phone, 'Essa data não está disponível para reagendamento.', conversation.id);
      return;
    }
    const appointment = await this.appointmentForConversation(input, conversation);
    if (appointment === null) {
      await this.dispatchText(input, phone, 'O agendamento não está mais disponível.', conversation.id);
      return;
    }
    const dates = await this.availableRescheduleDates(input.tenantId, appointment);
    if (!dates.includes(date)) {
      await this.dispatchText(input, phone, 'Essa data não está disponível para reagendamento.', conversation.id);
      return;
    }
    await this.repository.updateConversation(conversation.id, {
      currentFlow: 'BOOKING_RESCHEDULE',
      currentStep: 'DATE_SELECTED',
      context: { appointmentPublicId: appointment.publicId, rescheduleDate: date },
    });
    await this.showRescheduleTimes(input, conversation, phone, 0, appointment, date);
  }

  private async showRescheduleTimes(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    conversation: { id: bigint; customerId: bigint | null; context: unknown },
    phone: string,
    offset: number,
    knownAppointment?: Awaited<ReturnType<AppointmentService['getForCustomer']>>,
    knownDate?: string,
  ): Promise<void> {
    const appointment = knownAppointment ?? (await this.appointmentForConversation(input, conversation));
    const date = knownDate ?? contextString(conversation.context, 'rescheduleDate');
    if (appointment === null || date === null) {
      await this.dispatchText(input, phone, 'O agendamento não está mais disponível.', conversation.id);
      return;
    }
    const slots = await this.availableRescheduleSlots(input.tenantId, appointment, date);
    if (slots.length === 0) {
      await this.dispatchCustomButtons(
        input,
        phone,
        'Não há mais horários disponíveis para esta data.',
        [
          { buttonId: 'BOOKING_RESCHEDULE', label: 'Escolher outra data' },
          { buttonId: 'BOOKING_RESCHEDULE_ABORT', label: 'Voltar ao agendamento' },
        ],
        conversation.id,
      );
      return;
    }
    const page = slots.slice(offset, offset + 3);
    if (page.length === 0) return this.showRescheduleTimes(input, conversation, phone, 0, appointment, date);
    const tenant = await this.repository.tenantName(input.tenantId);
    const timezone = tenant?.timezone ?? 'UTC';
    const buttons = page.map((slot) => ({
      buttonId: `BOOKING_RESCHEDULE_TIME:${formatAppointmentTime(slot, timezone)}`,
      label: formatAppointmentTime(slot, timezone),
    }));
    if (slots.length > offset + page.length)
      buttons.push({
        buttonId: `BOOKING_RESCHEDULE_TIMES_PAGE:${String(offset + page.length)}`,
        label: 'Ver próximos',
      });
    buttons.push({ buttonId: 'BOOKING_RESCHEDULE_ABORT', label: 'Voltar ao agendamento' });
    await this.dispatchCustomButtons(
      input,
      phone,
      'Escolha um horário disponível:',
      buttons,
      conversation.id,
    );
  }

  private async selectRescheduleTime(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    conversation: { id: bigint; customerId: bigint | null; context: unknown },
    phone: string,
    time: string,
  ): Promise<void> {
    if (!/^\d{2}:\d{2}$/u.test(time)) {
      await this.dispatchText(input, phone, 'Esse horário não está mais disponível.', conversation.id);
      return;
    }
    const appointment = await this.appointmentForConversation(input, conversation);
    const date = contextString(conversation.context, 'rescheduleDate');
    if (appointment === null || date === null) {
      await this.dispatchText(input, phone, 'O agendamento não está mais disponível.', conversation.id);
      return;
    }
    const slots = await this.availableRescheduleSlots(input.tenantId, appointment, date);
    const tenant = await this.repository.tenantName(input.tenantId);
    const timezone = tenant?.timezone ?? 'UTC';
    if (!slots.some((slot) => formatAppointmentTime(slot, timezone) === time)) {
      await this.dispatchText(input, phone, 'Esse horário não está mais disponível.', conversation.id);
      return;
    }
    await this.repository.updateConversation(conversation.id, {
      currentFlow: 'BOOKING_RESCHEDULE',
      currentStep: 'CONFIRMATION',
      context: { appointmentPublicId: appointment.publicId, rescheduleDate: date, rescheduleTime: time },
    });
    const message = `Confirmar reagendamento?\n\nDe:\n📅 ${formatAppointmentDate(appointment.startsAt, timezone)}\n🕐 ${formatAppointmentTime(appointment.startsAt, timezone)}\n\nPara:\n📅 ${formatAppointmentDate(`${date}T12:00:00.000Z`, timezone)}\n🕐 ${time}\n\n✂️ ${appointment.serviceName}\n👤 ${appointment.professionalName}`;
    await this.dispatchCustomButtons(
      input,
      phone,
      message,
      [
        { buttonId: 'BOOKING_RESCHEDULE_CONFIRM', label: 'Confirmar alteração' },
        { buttonId: 'BOOKING_RESCHEDULE_CHANGE_TIME', label: 'Escolher outro horário' },
        { buttonId: 'BOOKING_RESCHEDULE_ABORT', label: 'Cancelar reagendamento' },
      ],
      conversation.id,
    );
  }

  private async changeRescheduleTime(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    conversation: { id: bigint; customerId: bigint | null; context: unknown },
    phone: string,
  ): Promise<void> {
    const appointmentPublicId = appointmentPublicIdFrom(conversation.context);
    const date = contextString(conversation.context, 'rescheduleDate');
    if (appointmentPublicId === null || date === null) {
      await this.dispatchText(input, phone, 'O agendamento não está mais disponível.', conversation.id);
      return;
    }
    await this.repository.updateConversation(conversation.id, {
      currentFlow: 'BOOKING_RESCHEDULE',
      currentStep: 'DATE_SELECTED',
      context: { appointmentPublicId, rescheduleDate: date },
    });
    await this.showRescheduleTimes(input, conversation, phone, 0);
  }

  private async confirmReschedule(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    conversation: { id: bigint; customerId: bigint | null; context: unknown },
    phone: string,
  ): Promise<void> {
    const customerId = conversation.customerId ?? input.customerId;
    const appointmentPublicId = appointmentPublicIdFrom(conversation.context);
    const date = contextString(conversation.context, 'rescheduleDate');
    const time = contextString(conversation.context, 'rescheduleTime');
    const lastRescheduledStartsAt = contextString(conversation.context, 'lastRescheduledStartsAt');
    if (customerId === null || appointmentPublicId === null || this.appointments === undefined) {
      await this.dispatchText(input, phone, 'O agendamento não está mais disponível.', conversation.id);
      return;
    }
    if (date === null || time === null) {
      if (lastRescheduledStartsAt !== null) {
        const current = await this.appointmentForConversation(input, conversation);
        if (current?.startsAt === lastRescheduledStartsAt) {
          await this.sendRescheduleSuccess(input, conversation.id, phone, current);
          return;
        }
      }
      await this.dispatchText(input, phone, 'O agendamento não está mais disponível.', conversation.id);
      return;
    }
    const appointment = await this.appointmentForConversation(input, conversation);
    if (appointment === null) {
      await this.dispatchText(input, phone, 'O agendamento não está mais disponível.', conversation.id);
      return;
    }
    const slots = await this.availableRescheduleSlots(input.tenantId, appointment, date);
    const tenant = await this.repository.tenantName(input.tenantId);
    const timezone = tenant?.timezone ?? 'UTC';
    const target = slots.find((slot) => formatAppointmentTime(slot, timezone) === time);
    if (target === undefined) {
      await this.dispatchText(input, phone, 'Esse horário acabou de ficar indisponível.', conversation.id);
      await this.showRescheduleTimes(input, conversation, phone, 0, appointment, date);
      return;
    }
    if (appointment.startsAt === target) {
      await this.sendRescheduleSuccess(input, conversation.id, phone, appointment);
      return;
    }
    try {
      await this.appointments.rescheduleForCustomer(
        input.tenantId,
        customerId,
        appointmentPublicId,
        target,
        'Reagendado pelo cliente via WhatsApp',
      );
    } catch {
      const current = await this.appointmentForConversation(input, conversation);
      if (current?.startsAt === target) {
        await this.sendRescheduleSuccess(input, conversation.id, phone, current);
        return;
      }
      await this.dispatchText(input, phone, 'Esse horário acabou de ficar indisponível.', conversation.id);
      await this.showRescheduleTimes(input, conversation, phone, 0, appointment, date);
      return;
    }
    const updated = await this.appointments.getForCustomer(input.tenantId, customerId, appointmentPublicId);
    await this.sendRescheduleSuccess(input, conversation.id, phone, updated);
  }

  private async sendRescheduleSuccess(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    conversationId: bigint,
    phone: string,
    appointment: Awaited<ReturnType<AppointmentService['getForCustomer']>>,
  ): Promise<void> {
    const tenant = await this.repository.tenantName(input.tenantId);
    const timezone = tenant?.timezone ?? 'UTC';
    await this.repository.updateConversation(conversationId, {
      currentFlow: 'BOOKING_QUERY',
      currentStep: 'BOOKING_DETAILS',
      context: { appointmentPublicId: appointment.publicId, lastRescheduledStartsAt: appointment.startsAt },
    });
    await this.dispatchCustomButtons(
      input,
      phone,
      `Agendamento reagendado com sucesso ✅\n\n📅 ${formatAppointmentDate(appointment.startsAt, timezone)}\n🕐 ${formatAppointmentTime(appointment.startsAt, timezone)}\n✂️ ${appointment.serviceName}\n👤 ${appointment.professionalName}`,
      [
        { buttonId: `BOOKING_SELECT:${appointment.publicId}`, label: 'Ver agendamento' },
        { buttonId: 'BOOKING_DIRECTIONS', label: 'Como chegar' },
        { buttonId: 'MAIN_MENU_BACK', label: 'Voltar ao menu' },
      ],
      conversationId,
    );
  }

  private async abortReschedule(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    conversation: { id: bigint; customerId: bigint | null; context: unknown },
    phone: string,
  ): Promise<void> {
    const appointmentPublicId = appointmentPublicIdFrom(conversation.context);
    if (appointmentPublicId === null) {
      await this.dispatchText(input, phone, 'O agendamento não está mais disponível.', conversation.id);
      return;
    }
    await this.repository.updateConversation(conversation.id, {
      currentFlow: 'BOOKING_QUERY',
      currentStep: 'BOOKING_DETAILS',
      context: { appointmentPublicId },
    });
    await this.showSelectedAppointment(input, conversation, phone, appointmentPublicId);
  }

  private async availableRescheduleDates(
    tenantId: bigint,
    appointment: Awaited<ReturnType<AppointmentService['getForCustomer']>>,
  ): Promise<string[]> {
    if (this.availability === undefined) return [];
    const tenant = await this.repository.tenantName(tenantId);
    const timezone = tenant?.timezone ?? 'UTC';
    const candidates = followingDates(timezone, 7);
    const results = await Promise.all(
      candidates.map(async (date) => {
        try {
          const availability = await this.availability?.available(tenantId, {
            date,
            professionalPublicId: appointment.professionalPublicId,
            servicePublicId: appointment.servicePublicId,
            ...(appointment.unitPublicId === null ? {} : { unitPublicId: appointment.unitPublicId }),
          });
          return availability?.slots.some((slot) => slot.state === 'AVAILABLE') === true ? date : null;
        } catch {
          return null;
        }
      }),
    );
    return results.flatMap((date) => (date === null ? [] : [date])).slice(0, 3);
  }

  private async availableRescheduleSlots(
    tenantId: bigint,
    appointment: Awaited<ReturnType<AppointmentService['getForCustomer']>>,
    date: string,
  ): Promise<string[]> {
    if (this.availability === undefined) return [];
    try {
      const availability = await this.availability.available(tenantId, {
        date,
        professionalPublicId: appointment.professionalPublicId,
        servicePublicId: appointment.servicePublicId,
        ...(appointment.unitPublicId === null ? {} : { unitPublicId: appointment.unitPublicId }),
      });
      return availability.slots
        .filter((slot) => slot.state === 'AVAILABLE')
        .map((slot) => slot.startsAt);
    } catch {
      return [];
    }
  }

  private async confirmAppointment(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    conversation: { id: bigint; customerId: bigint | null; context: unknown },
    phone: string,
    conciseReply = false,
  ): Promise<void> {
    const customerId = conversation.customerId ?? input.customerId;
    const appointmentPublicId = appointmentPublicIdFrom(conversation.context);
    if (customerId === null || appointmentPublicId === null || this.appointments === undefined) {
      await this.dispatchText(input, phone, 'O agendamento não está mais disponível.', conversation.id);
      return;
    }
    let appointment: Awaited<ReturnType<AppointmentService['getForCustomer']>>;
    try {
      appointment = await this.appointments.getForCustomer(input.tenantId, customerId, appointmentPublicId);
    } catch {
      await this.dispatchText(input, phone, 'O agendamento não está mais disponível.', conversation.id);
      return;
    }
    if (appointment.status === 'CONFIRMED') {
      await this.dispatchText(
        input,
        phone,
        conciseReply ? 'Seu agendamento já está confirmado ✅' : 'Seu agendamento já está confirmado.',
        conversation.id,
      );
      return;
    }
    if (appointment.status === 'CANCELED') {
      await this.dispatchText(input, phone, 'Este agendamento foi cancelado e não pode mais ser confirmado.', conversation.id);
      return;
    }
    if (appointment.status === 'COMPLETED') {
      await this.dispatchText(input, phone, 'Este agendamento já foi concluído.', conversation.id);
      return;
    }
    try {
      await this.appointments.status(input.tenantId, appointmentPublicId, 'CONFIRMED', undefined, {
        userId: null,
        sessionId: null,
      });
    } catch {
      // Um webhook duplicado pode chegar depois da primeira transição. Releia o
      // estado real para devolver a mesma resposta idempotente, sem nova escrita.
      try {
        const current = await this.appointments.getForCustomer(
          input.tenantId,
          customerId,
          appointmentPublicId,
        );
        if (current.status === 'CONFIRMED') {
          await this.dispatchText(
            input,
            phone,
            conciseReply ? 'Seu agendamento já está confirmado ✅' : 'Seu agendamento já está confirmado.',
            conversation.id,
          );
          return;
        }
      } catch {
        // A resposta abaixo preserva a regra do domínio sem expor detalhes internos.
      }
      await this.dispatchText(input, phone, 'Não foi possível confirmar este agendamento.', conversation.id);
      return;
    }
    const confirmed = await this.appointments.getForCustomer(
      input.tenantId,
      customerId,
      appointmentPublicId,
    );
    if (conciseReply) {
      await this.dispatchText(
        input,
        phone,
        'Obrigado! Seu agendamento está confirmado ✅\n\nEsperamos você.',
        conversation.id,
      );
      return;
    }
    await this.sendConfirmation(input, conversation.id, phone, confirmed);
  }

  private async requestCancellation(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    conversation: { id: bigint; customerId: bigint | null; context: unknown },
    phone: string,
  ): Promise<void> {
    const appointment = await this.appointmentForConversation(input, conversation);
    if (appointment === null) {
      await this.dispatchText(input, phone, 'O agendamento não está mais disponível.', conversation.id);
      return;
    }
    if (appointment.status === 'CANCELED') {
      await this.dispatchText(input, phone, 'Este agendamento já está cancelado.', conversation.id);
      return;
    }
    if (appointment.status === 'COMPLETED') {
      await this.dispatchText(input, phone, 'Este agendamento já foi concluído e não pode ser cancelado.', conversation.id);
      return;
    }
    const tenant = await this.repository.tenantName(input.tenantId);
    const timezone = tenant?.timezone ?? 'UTC';
    const message = `Tem certeza que deseja cancelar este agendamento?\n\n📅 ${formatAppointmentDate(appointment.startsAt, timezone)}\n🕐 ${formatAppointmentTime(appointment.startsAt, timezone)}\n✂️ ${appointment.serviceName}\n👤 ${appointment.professionalName}`;
    await this.dispatchCustomButtons(
      input,
      phone,
      message,
      [
        { buttonId: 'BOOKING_CANCEL_CONFIRM', label: 'Sim, cancelar' },
        { buttonId: 'BOOKING_CANCEL_ABORT', label: 'Não, manter' },
      ],
      conversation.id,
    );
  }

  private async cancelAppointment(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    conversation: { id: bigint; customerId: bigint | null; context: unknown },
    phone: string,
  ): Promise<void> {
    const customerId = conversation.customerId ?? input.customerId;
    const selectedAppointmentPublicId = appointmentPublicIdFrom(conversation.context);
    const appointmentPublicId =
      selectedAppointmentPublicId ?? lastCanceledAppointmentPublicIdFrom(conversation.context);
    if (customerId === null || appointmentPublicId === null || this.appointments === undefined) {
      await this.dispatchText(input, phone, 'O agendamento não está mais disponível.', conversation.id);
      return;
    }
    let appointment: Awaited<ReturnType<AppointmentService['getForCustomer']>> | null = null;
    try {
      appointment = await this.appointments.getForCustomer(input.tenantId, customerId, appointmentPublicId);
    } catch {
      // Mantém a resposta abaixo sem expor se o identificador pertence a outro cliente.
    }
    if (appointment === null) {
      await this.dispatchText(input, phone, 'O agendamento não está mais disponível.', conversation.id);
      return;
    }
    if (selectedAppointmentPublicId === null && appointment.status !== 'CANCELED') {
      await this.dispatchText(input, phone, 'O agendamento não está mais disponível.', conversation.id);
      return;
    }
    if (appointment.status === 'CANCELED') {
      await this.dispatchText(input, phone, 'Este agendamento já está cancelado.', conversation.id);
      return;
    }
    if (appointment.status === 'COMPLETED') {
      await this.dispatchText(input, phone, 'Este agendamento já foi concluído e não pode ser cancelado.', conversation.id);
      return;
    }
    try {
      await this.appointments.cancelForCustomer(
        input.tenantId,
        customerId,
        appointmentPublicId,
        'Cancelado pelo cliente via WhatsApp',
      );
    } catch {
      const current = await this.appointmentForConversation(input, conversation);
      if (current?.status === 'CANCELED') {
        await this.dispatchText(input, phone, 'Este agendamento já está cancelado.', conversation.id);
        return;
      }
      await this.sendCancellationUnavailable(input, phone, conversation.id);
      return;
    }
    await this.repository.updateConversation(conversation.id, {
      currentFlow: 'MAIN_MENU',
      currentStep: null,
      context: { lastCanceledAppointmentPublicId: appointmentPublicId },
    });
    const tenant = await this.repository.tenantName(input.tenantId);
    const timezone = tenant?.timezone ?? 'UTC';
    const message = `Agendamento cancelado.\n\n📅 ${formatAppointmentDate(appointment.startsAt, timezone)}\n🕐 ${formatAppointmentTime(appointment.startsAt, timezone)}\n✂️ ${appointment.serviceName}`;
    await this.dispatchCustomButtons(
      input,
      phone,
      message,
      [
        { buttonId: 'MAIN_MENU_BOOK', label: 'Agendar novo horário' },
        { buttonId: 'MAIN_MENU_BACK', label: 'Voltar ao menu' },
      ],
      conversation.id,
    );
  }

  private async abortCancellation(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    conversation: { id: bigint; customerId: bigint | null; context: unknown },
    phone: string,
  ): Promise<void> {
    const appointmentPublicId = appointmentPublicIdFrom(conversation.context);
    if (appointmentPublicId === null) {
      await this.dispatchText(input, phone, 'O agendamento não está mais disponível.', conversation.id);
      return;
    }
    await this.dispatchCustomButtons(
      input,
      phone,
      'Seu agendamento foi mantido.',
      [
        { buttonId: `BOOKING_SELECT:${appointmentPublicId}`, label: 'Ver agendamento' },
        { buttonId: 'MAIN_MENU_BACK', label: 'Voltar ao menu' },
      ],
      conversation.id,
    );
  }

  private async appointmentForConversation(
    input: { tenantId: bigint; customerId: bigint | null },
    conversation: { customerId: bigint | null; context: unknown },
  ): Promise<Awaited<ReturnType<AppointmentService['getForCustomer']>> | null> {
    const customerId = conversation.customerId ?? input.customerId;
    const appointmentPublicId = appointmentPublicIdFrom(conversation.context);
    if (customerId === null || appointmentPublicId === null || this.appointments === undefined) return null;
    try {
      return await this.appointments.getForCustomer(input.tenantId, customerId, appointmentPublicId);
    } catch {
      return null;
    }
  }

  private async sendCancellationUnavailable(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    phone: string,
    conversationId: bigint,
  ): Promise<void> {
    await this.dispatchCustomButtons(
      input,
      phone,
      'Este agendamento não pode mais ser cancelado automaticamente.',
      [
        { buttonId: 'MAIN_MENU_OTHER', label: 'Falar com o estabelecimento' },
        { buttonId: 'MAIN_MENU_BACK', label: 'Voltar ao menu' },
      ],
      conversationId,
    );
  }

  private async sendConfirmation(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    conversationId: bigint,
    phone: string,
    appointment: Awaited<ReturnType<AppointmentService['getForCustomer']>>,
  ): Promise<void> {
    const tenant = await this.repository.tenantName(input.tenantId);
    const timezone = tenant?.timezone ?? 'UTC';
    const message = `Agendamento confirmado ✅\n\n📅 ${formatAppointmentDate(appointment.startsAt, timezone)}\n🕐 ${formatAppointmentTime(appointment.startsAt, timezone)}\n✂️ ${appointment.serviceName}\n👤 ${appointment.professionalName}\n\nEsperamos você!`;
    await this.dispatchCustomButtons(
      input,
      phone,
      message,
      [
        { buttonId: `BOOKING_SELECT:${appointment.publicId}`, label: 'Ver agendamento' },
        { buttonId: 'BOOKING_DIRECTIONS', label: 'Como chegar' },
        { buttonId: 'MAIN_MENU_BACK', label: 'Voltar ao menu' },
      ],
      conversationId,
    );
  }

  private async sendDirections(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    phone: string,
    conversationId: bigint,
  ): Promise<void> {
    const [tenant, site] = await Promise.all([
      this.repository.tenantName(input.tenantId),
      this.bookingSite(input.tenantId),
    ]);
    const unit = site?.unit;
    const coordinatesUrl =
      unit?.latitude === null || unit?.latitude === undefined || unit.longitude === null || unit.longitude === undefined
        ? null
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${String(unit.latitude)},${String(unit.longitude)}`)}`;
    const address = [unit?.street, unit?.number, unit?.district, unit?.city, unit?.state]
      .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
      .join(', ');
    const addressUrl = address === ''
      ? null
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    const url = unit?.googleMapsUrl ?? coordinatesUrl ?? addressUrl;
    if (url === null || url === undefined) {
      await this.dispatchText(
        input,
        phone,
        'O estabelecimento ainda não cadastrou uma localização para navegação.',
        conversationId,
      );
      return;
    }
    await this.dispatchText(
      input,
      phone,
      `Como chegar até ${tenant?.displayName ?? 'o estabelecimento'}\n\n${url}`,
      conversationId,
    );
  }

  private async showAppointment(input: { tenantId: bigint; instanceId: string; customerId: bigint | null }, conversationId: bigint, phone: string, appointment: { publicId: string; startsAt: string; serviceName: string; professionalName: string; priceCents: string; status: string }, customerId: bigint) {
    const tenant = await this.repository.tenantName(input.tenantId);
    const timezone = tenant?.timezone ?? 'UTC';
    const status: Record<string, string> = { PENDING: 'Pendente', CONFIRMED: 'Confirmado', IN_PROGRESS: 'Em atendimento' };
    const value = (Number(appointment.priceCents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: tenant?.currency ?? 'BRL' });
    const message = `Seu próximo agendamento:\n\n📅 ${formatAppointmentDate(appointment.startsAt, timezone)}\n🕐 ${formatAppointmentTime(appointment.startsAt, timezone)}\n✂️ ${appointment.serviceName}\n👤 ${appointment.professionalName}\n💰 ${value}\nStatus: ${status[appointment.status] ?? 'Agendado'}`;
    await this.repository.updateConversation(conversationId, { customerId, currentFlow: 'BOOKING_QUERY', currentStep: 'BOOKING_DETAILS', context: { appointmentPublicId: appointment.publicId } });
    await this.dispatchCustomButtons(input, phone, message, BOOKING_ACTIONS.map((action) => ({ buttonId: action.actionId, label: action.label })), conversationId);
  }

  private async sendGreetingWithMenu(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    phone: string,
    conversationId: bigint,
  ) {
    const [tenant, customer] = await Promise.all([
      this.repository.tenantName(input.tenantId),
      input.customerId === null
        ? Promise.resolve(null)
        : this.repository.customerName(input.customerId),
    ]);
    const greeting = greetingMessage(tenant?.displayName ?? 'nossa equipe', customer?.name ?? null);
    await this.dispatchButtons(input, phone, greeting, conversationId);
  }

  /** Menu principal. O envio e o rastreio passam pelo mesmo caminho de sempre. */
  private async dispatchButtons(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    phone: string,
    message: string,
    conversationId: bigint,
  ) {
    const delivery = this.delivery;
    if (delivery === undefined) return;
    const result = await delivery.sendInteractiveButtons(input.tenantId, phone, message, menuButtons);
    await this.trackOutbound(input, phone, result, menuActionIds, conversationId);
  }

  private async dispatchText(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    phone: string,
    message: string,
    conversationId: bigint,
  ) {
    const delivery = this.delivery;
    if (delivery === undefined) return;
    const result = await delivery.sendPlainText(input.tenantId, phone, message);
    await this.trackOutbound(input, phone, result, [], conversationId);
  }

  private async dispatchCustomButtons(input: { tenantId: bigint; instanceId: string; customerId: bigint | null }, phone: string, message: string, buttons: WhatsAppInteractiveButton[], conversationId: bigint) {
    const delivery = this.delivery;
    if (delivery === undefined) return;
    const result = await delivery.sendInteractiveButtons(input.tenantId, phone, message, buttons);
    await this.trackOutbound(input, phone, result, buttons.map((button) => button.buttonId), conversationId);
  }

  private async trackOutbound(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    phone: string,
    result: { externalMessageId: string | null; status: string; errorCode: string | null },
    actionIds: string[],
    conversationId: bigint,
  ) {
    await this.repository.createOutboundMessage({
      tenantId: input.tenantId,
      instanceId: input.instanceId,
      phone,
      externalMessageId: result.externalMessageId,
      actionIds,
      status: result.status,
      customerId: input.customerId,
      errorCode: result.errorCode,
    });
    await this.repository.updateConversation(conversationId, { lastOutboundAt: new Date() });
  }
}
