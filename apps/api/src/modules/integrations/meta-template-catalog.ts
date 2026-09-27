export type MetaTemplatePurpose =
  | 'APPOINTMENT_REMINDER'
  | 'APPOINTMENT_CONFIRMATION'
  | 'APPOINTMENT_CHANGED'
  | 'APPOINTMENT_CANCELLED'
  | 'PAYMENT_REMINDER'
  | 'CUSTOMER_REACTIVATION';

export interface MetaTemplateDefinition {
  purpose: MetaTemplatePurpose;
  friendlyName: string;
  name: string;
  category: 'UTILITY' | 'MARKETING';
  language: 'pt_BR';
  body: string;
  examples: string[];
  buttons?: Array<{ type: 'QUICK_REPLY'; text: string; semanticId: string }>;
}

export const AGENDEI_META_TEMPLATES: MetaTemplateDefinition[] = [
  {
    purpose: 'APPOINTMENT_REMINDER',
    friendlyName: 'Lembrete de agendamento',
    name: 'agendei_appointment_reminder_v1',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}.\n\nEste é um lembrete do seu agendamento em {{2}}.\n\nServiço: {{3}}\nProfissional: {{4}}\nData: {{5}}\nHorário: {{6}}\n\nSe precisar de ajuda, responda esta mensagem.',
    examples: ['Rafael', 'Barbearia Central', 'Corte masculino', 'João', '12/10/2026', '14:00'],
  },
  {
    purpose: 'APPOINTMENT_CONFIRMATION',
    friendlyName: 'Confirmação de agendamento',
    name: 'agendei_appointment_confirmation_v1',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}.\n\nSeu agendamento em {{2}} está marcado para:\n\nServiço: {{3}}\nProfissional: {{4}}\nData: {{5}}\nHorário: {{6}}\n\nConfirme sua presença.',
    examples: ['Rafael', 'Barbearia Central', 'Corte masculino', 'João', '12/10/2026', '14:00'],
    buttons: [
      { type: 'QUICK_REPLY', text: 'Confirmar', semanticId: 'CONFIRM_APPOINTMENT' },
      { type: 'QUICK_REPLY', text: 'Reagendar', semanticId: 'RESCHEDULE_APPOINTMENT' },
    ],
  },
  {
    purpose: 'APPOINTMENT_CHANGED',
    friendlyName: 'Agendamento alterado',
    name: 'agendei_appointment_changed_v1',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}.\n\nSeu agendamento em {{2}} foi atualizado.\n\nServiço: {{3}}\nProfissional: {{4}}\nNova data: {{5}}\nNovo horário: {{6}}\n\nSe precisar de ajuda, responda esta mensagem.',
    examples: ['Rafael', 'Barbearia Central', 'Corte masculino', 'João', '12/10/2026', '14:00'],
  },
  {
    purpose: 'APPOINTMENT_CANCELLED',
    friendlyName: 'Agendamento cancelado',
    name: 'agendei_appointment_cancelled_v1',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}.\n\nSeu agendamento em {{2}} foi cancelado.\n\nServiço: {{3}}\nData: {{4}}\nHorário: {{5}}\n\nSe quiser realizar um novo agendamento, responda esta mensagem.',
    examples: ['Rafael', 'Barbearia Central', 'Corte masculino', '12/10/2026', '14:00'],
  },
  {
    purpose: 'PAYMENT_REMINDER',
    friendlyName: 'Lembrete de pagamento',
    name: 'agendei_payment_reminder_v1',
    category: 'UTILITY',
    language: 'pt_BR',
    body: 'Olá, {{1}}.\n\nIdentificamos um valor pendente de {{2}} referente a {{3}}.\n\nSe o pagamento já foi realizado, desconsidere esta mensagem.\n\nSe precisar de ajuda, responda esta mensagem.',
    examples: ['Rafael', 'R$ 89,90', 'plano mensal'],
  },
  {
    purpose: 'CUSTOMER_REACTIVATION',
    friendlyName: 'Reativação de cliente',
    name: 'agendei_customer_reactivation_v1',
    category: 'MARKETING',
    language: 'pt_BR',
    body: 'Olá, {{1}}.\n\nJá faz algum tempo desde seu último atendimento na {{2}}.\n\nSe quiser agendar novamente, responda esta mensagem e ajudamos você a encontrar um horário.',
    examples: ['Rafael', 'Barbearia Central'],
  },
];
