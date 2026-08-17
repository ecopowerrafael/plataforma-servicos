import { z } from 'zod';
export const DepositTypeSchema = z.enum(['FIXED', 'PERCENTAGE']);
const inputShape = {
  customerPublicId: z.uuid(),
  professionalPublicId: z.uuid(),
  servicePublicId: z.uuid(),
  unitPublicId: z.uuid().nullable().optional(),
  startsAt: z.iso.datetime({ offset: true }),
  notes: z.string().trim().max(2000).nullable().optional(),
  source: z.string().trim().min(1).max(64).default('INTERNAL'),
  isFitIn: z.boolean().default(false),
  fitInReason: z.string().trim().min(3).max(500).optional(),
  depositType: DepositTypeSchema.nullable().optional(),
  depositValue: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
  /** Agenda uma sessão do plano informado, em vez de um atendimento comum. */
  treatmentPlanPublicId: z.uuid().optional(),
};
function withFitInValidation<T extends z.ZodType>(schema: T): T {
  return schema.superRefine((value, context) => {
    const input = value as { isFitIn?: boolean; fitInReason?: string };
    if (input.isFitIn === true && (input.fitInReason === undefined || input.fitInReason === ''))
      context.addIssue({
        code: 'custom',
        path: ['fitInReason'],
        message: 'Informe o motivo do encaixe.',
      });
  });
}
function withDepositValidation<T extends z.ZodType>(schema: T): T {
  return schema.superRefine((value, context) => {
    const input = value as {
      depositType?: 'FIXED' | 'PERCENTAGE' | null;
      depositValue?: number;
    };
    if (input.depositType === undefined || input.depositType === null) return;
    if (input.depositValue === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['depositValue'],
        message: 'Informe o valor do sinal.',
      });
      return;
    }
    if (input.depositType === 'PERCENTAGE' && input.depositValue > 100)
      context.addIssue({
        code: 'custom',
        path: ['depositValue'],
        message: 'O percentual do sinal não pode ser maior que 100.',
      });
  });
}
export const CreateAppointmentRequestSchema = withDepositValidation(
  withFitInValidation(z.object(inputShape).strict()),
);
export const UpdateAppointmentRequestSchema = withDepositValidation(
  withFitInValidation(
    z
      .object({ ...inputShape, rescheduleReason: z.string().trim().min(2).max(500).optional() })
      .strict(),
  ),
);
export const AppointmentStatusRequestSchema = z
  .object({ reason: z.string().trim().min(2).max(500).optional() })
  .strict();
export const CustomerRescheduleAppointmentRequestSchema = z
  .object({
    startsAt: z.iso.datetime({ offset: true }),
    reason: z.string().trim().min(2).max(500),
  })
  .strict();
export const ProfessionalAppointmentNotesRequestSchema = z
  .object({ notes: z.string().trim().max(2000).nullable() })
  .strict();
export const AppointmentCheckInRequestSchema = z
  .object({ checkedInAt: z.iso.datetime({ offset: true }).optional() })
  .strict();
export const AppointmentQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    status: z
      .enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED', 'NO_SHOW'])
      .optional(),
    professionalPublicId: z.uuid().optional(),
    customerPublicId: z.uuid().optional(),
    servicePublicId: z.uuid().optional(),
    unitPublicId: z.uuid().optional(),
    search: z.string().trim().min(1).max(160).optional(),
    /* Paginação opcional: sem `limit` a listagem devolve o período inteiro, como antes. */
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    direction: z.enum(['asc', 'desc']).optional(),
  })
  .strict();
/** Papel do agendamento; persistido, nunca inferido pelo status ou pelo nome. */
export const AppointmentKindSchema = z.enum(['STANDARD', 'EVALUATION', 'TREATMENT_SESSION']);
export const AppointmentPublicSchema = z.object({
  publicId: z.uuid(),
  protocol: z.string(),
  customerPublicId: z.uuid(),
  customerName: z.string(),
  customerPhone: z.string().nullable(),
  professionalPublicId: z.uuid(),
  professionalName: z.string(),
  servicePublicId: z.uuid(),
  serviceName: z.string(),
  unitPublicId: z.uuid().nullable(),
  unitName: z.string().nullable(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int(),
  postServiceBreakMinutes: z.number().int(),
  priceCents: z.string(),
  status: z.enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED', 'NO_SHOW']),
  notes: z.string().nullable(),
  source: z.string(),
  canceledReason: z.string().nullable(),
  rescheduleReason: z.string().nullable(),
  kind: AppointmentKindSchema,
  /** Plano de tratamento das sessões; nulo em avaliações e atendimentos comuns. */
  treatmentPlanPublicId: z.uuid().nullable(),
  sessionNumber: z.number().int().min(1).nullable(),
  isFitIn: z.boolean(),
  fitInReason: z.string().nullable(),
  checkedInAt: z.iso.datetime({ offset: true }).nullable(),
  depositType: DepositTypeSchema.nullable(),
  depositPercentage: z.number().int().min(1).max(100).nullable(),
  depositAmountCents: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export const AppointmentListResponseSchema = z.object({
  items: z.array(AppointmentPublicSchema),
  /* Presentes apenas quando a consulta é paginada. */
  total: z.number().int().nonnegative().optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).optional(),
});
export const AppointmentStatusResponseSchema = z.object({ success: z.literal(true) });
export type CreateAppointmentRequest = z.infer<typeof CreateAppointmentRequestSchema>;
export type UpdateAppointmentRequest = z.infer<typeof UpdateAppointmentRequestSchema>;
