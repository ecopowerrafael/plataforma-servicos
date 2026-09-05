import {
  AppointmentPublicSchema,
  CreateAppointmentRequestSchema,
  CustomerListResponseSchema,
  ProfessionalListResponseSchema,
  ServiceListResponseSchema,
  UpdateAppointmentRequestSchema,
} from '@plataforma/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';
import { ConfirmationDialog, type ConfirmationRequest } from '../ConfirmationDialog.js';
import { UnitSelect } from '../tenants/UnitSelect.js';

type Appointment = ReturnType<typeof AppointmentPublicSchema.parse>;

const localDateTime = (iso?: string) => {
  const value = iso === undefined ? new Date() : new Date(iso);
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
};

/**
 * Criação e edição de agendamento. As regras continuam as mesmas: encaixe exige confirmação
 * com motivo, sinal aceita valor fixo ou percentual e a edição pede motivo de reagendamento.
 */
export function AppointmentEditorDialog({
  tenantPublicId,
  appointment,
  presetCustomerPublicId,
  treatmentPlan,
  canFitIn,
  onClose,
  onSaved,
}: {
  tenantPublicId: string;
  appointment: Appointment | null;
  presetCustomerPublicId?: string;
  /** Sessão de um tratamento: cliente, serviço e profissional vêm do plano. */
  treatmentPlan?: {
    publicId: string;
    customerPublicId: string;
    servicePublicId: string;
    professionalPublicId: string;
    sessionLabel: string;
    recommendedNextDate: string | null;
  };
  canFitIn: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const editing = appointment !== null;
  const [customer, setCustomer] = useState(
    appointment?.customerPublicId ?? treatmentPlan?.customerPublicId ?? presetCustomerPublicId ?? '',
  );
  const [professional, setProfessional] = useState(
    appointment?.professionalPublicId ?? treatmentPlan?.professionalPublicId ?? '',
  );
  const [service, setService] = useState(
    appointment?.servicePublicId ?? treatmentPlan?.servicePublicId ?? '',
  );
  const [unitPublicId, setUnitPublicId] = useState(appointment?.unitPublicId ?? '');
  const [startsAt, setStartsAt] = useState(() => localDateTime(appointment?.startsAt));
  const [notes, setNotes] = useState(appointment?.notes ?? '');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [isFitIn, setIsFitIn] = useState(appointment?.isFitIn ?? false);
  const [depositType, setDepositType] = useState(appointment?.depositType ?? '');
  const [depositValue, setDepositValue] = useState(() =>
    appointment?.depositType === 'FIXED' && appointment.depositAmountCents !== null
      ? (Number(appointment.depositAmountCents) / 100).toString()
      : appointment?.depositType === 'PERCENTAGE' && appointment.depositPercentage !== null
        ? String(appointment.depositPercentage)
        : '',
  );
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);

  const customers = useQuery({
    queryKey: ['tenant', tenantPublicId, 'customers', 'appointments'],
    queryFn: () =>
      httpClient.request('/tenant/customers?limit=100&active=true', {
        schema: CustomerListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const professionals = useQuery({
    queryKey: ['tenant', tenantPublicId, 'professionals', 'appointments'],
    queryFn: () =>
      httpClient.request('/tenant/professionals?limit=100&active=true', {
        schema: ProfessionalListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const services = useQuery({
    queryKey: ['tenant', tenantPublicId, 'services', 'appointments'],
    queryFn: () =>
      httpClient.request('/tenant/services?limit=100&active=true', {
        schema: ServiceListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (fitInReason?: string) =>
      httpClient.request(
        editing ? `/tenant/appointments/${appointment.publicId}` : '/tenant/appointments',
        {
          method: editing ? 'PATCH' : 'POST',
          body: (editing
            ? UpdateAppointmentRequestSchema
            : CreateAppointmentRequestSchema
          ).parse({
            customerPublicId: customer,
            professionalPublicId: professional,
            servicePublicId: service,
            ...(unitPublicId === '' ? {} : { unitPublicId }),
            startsAt: new Date(startsAt).toISOString(),
            notes: notes === '' ? null : notes,
            source: 'INTERNAL',
            ...(editing || treatmentPlan === undefined
              ? {}
              : { treatmentPlanPublicId: treatmentPlan.publicId }),
            ...(!editing || rescheduleReason === '' ? {} : { rescheduleReason }),
            isFitIn,
            ...(isFitIn ? { fitInReason } : {}),
            ...(depositType === ''
              ? {}
              : {
                  depositType,
                  depositValue:
                    depositType === 'FIXED'
                      ? Math.round(Number(depositValue.replace(',', '.')) * 100)
                      : Number(depositValue),
                }),
          }),
          schema: AppointmentPublicSchema,
          tenantPublicId,
        },
      ),
    onSuccess: () => {
      onSaved(editing ? 'Agendamento atualizado com sucesso.' : 'Agendamento criado com sucesso.');
    },
  });

  const submit = () => {
    if (isFitIn) {
      setConfirmation({
        title: 'Confirmar encaixe administrativo?',
        description:
          'O encaixe ignora as regras normais de horário de funcionamento, jornada e antecedência mínima. Ele continua respeitando conflitos reais de agenda do profissional. Informe o motivo.',
        confirmLabel: 'Confirmar encaixe',
        requiresReason: true,
        reasonLabel: 'Motivo do encaixe',
        variant: 'danger',
        onConfirm: async (reason) => {
          await mutation.mutateAsync(reason);
        },
      });
      return;
    }
    mutation.mutate(undefined);
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        className="dialog appointments-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="appointment-editor"
      >
        <h3 id="appointment-editor">{editing ? 'Editar agendamento' : 'Novo agendamento'}</h3>
        {treatmentPlan === undefined ? null : (
          /* A data recomendada é sugestão: o horário real vem da agenda. */
          <p className="ds-note">
            <strong>{treatmentPlan.sessionLabel}</strong>
            {treatmentPlan.recommendedNextDate === null
              ? ' — escolha a data com o cliente.'
              : ` — recomendada a partir de ${new Date(
                  treatmentPlan.recommendedNextDate,
                ).toLocaleDateString('pt-BR')}.`}
          </p>
        )}
        <p>Preencha os dados para reservar este horário.</p>
        <fieldset className="ds-form-section ds-form-section--2">
          {editing && (
            <label className="ds-field-full">
              Motivo do reagendamento
              <input
                value={rescheduleReason}
                onChange={(event) => {
                  setRescheduleReason(event.target.value);
                }}
              />
            </label>
          )}
          <label>
            Cliente
            <select
              value={customer}
              onChange={(event) => {
                setCustomer(event.target.value);
              }}
            >
              <option value="">Selecione</option>
              {customers.data?.items.map((item) => (
                <option key={item.publicId} value={item.publicId}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Profissional
            <select
              value={professional}
              onChange={(event) => {
                setProfessional(event.target.value);
              }}
            >
              <option value="">Selecione</option>
              {professionals.data?.items.map((item) => (
                <option key={item.publicId} value={item.publicId}>
                  {item.publicName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Serviço
            <select
              value={service}
              onChange={(event) => {
                setService(event.target.value);
              }}
            >
              <option value="">Selecione</option>
              {services.data?.items.map((item) => (
                <option key={item.publicId} value={item.publicId}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Início
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(event) => {
                setStartsAt(event.target.value);
              }}
            />
          </label>
          <label>
            Unidade
            <UnitSelect
              tenantPublicId={tenantPublicId}
              value={unitPublicId}
              onChange={setUnitPublicId}
            />
          </label>
          <label>
            Sinal (opcional)
            <select
              value={depositType}
              onChange={(event) => {
                setDepositType(event.target.value);
              }}
            >
              <option value="">Sem sinal</option>
              <option value="FIXED">Valor fixo (R$)</option>
              <option value="PERCENTAGE">Percentual (%)</option>
            </select>
          </label>
          {depositType !== '' && (
            <label>
              {depositType === 'FIXED' ? 'Valor do sinal (R$)' : 'Percentual do sinal (%)'}
              <input
                type="number"
                min="0"
                step={depositType === 'FIXED' ? '0.01' : '1'}
                value={depositValue}
                onChange={(event) => {
                  setDepositValue(event.target.value);
                }}
              />
            </label>
          )}
          <label className="ds-field-full">
            Observações
            <textarea
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
              }}
            />
          </label>
          {canFitIn && (
            <label className="ds-field-full ds-switch-field">
              <input
                checked={isFitIn}
                type="checkbox"
                onChange={(event) => {
                  setIsFitIn(event.target.checked);
                }}
              />
              <span>
                Encaixe administrativo (ignora horário normal, exige motivo e confirmação)
              </span>
            </label>
          )}
        </fieldset>
        {mutation.error instanceof Error && (
          <p className="form-error" role="alert">
            {mutation.error.message}
          </p>
        )}
        <div className="ds-form-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={
              mutation.isPending || customer === '' || professional === '' || service === ''
            }
            onClick={submit}
          >
            {editing ? 'Salvar alterações' : 'Criar agendamento'}
          </button>
        </div>
        {confirmation !== null && (
          <ConfirmationDialog
            request={confirmation}
            onClose={() => {
              setConfirmation(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
