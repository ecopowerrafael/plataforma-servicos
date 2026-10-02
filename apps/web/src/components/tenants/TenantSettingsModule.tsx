import { zodResolver } from '@hookform/resolvers/zod';
import {
  TenantSettingsInputSchema,
  TenantSettingsResponseSchema,
  TenantExperienceResponseSchema,
  type TenantSettings,
  type TenantTerminologyOverrides,
} from '@plataforma/shared';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type z } from 'zod';

import { httpClient } from '../../lib/http.js';
import '../../styles/settings.css';
import { TreatmentPlansConfigSection } from '../treatment-plans/TreatmentPlansConfigSection.js';
import { TreatmentPlansReminderConfigSection } from '../treatment-plans/TreatmentPlansReminderConfigSection.js';
import { InlineAlert, PageHeader, SectionCard, Switch } from '../ui/AppUi.js';

type Input = z.input<typeof TenantSettingsInputSchema>;

export function TenantSettingsModule({
  tenantPublicId,
  canUpdate,
}: {
  tenantPublicId: string;
  canUpdate: boolean;
}) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ['tenant', tenantPublicId, 'settings'],
    queryFn: () =>
      httpClient.request('/tenant/settings', {
        schema: TenantSettingsResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const experienceQuery = useQuery({
    queryKey: ['tenant', tenantPublicId, 'experience'],
    queryFn: () =>
      httpClient.request('/tenant/experience', {
        schema: TenantExperienceResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (settings: TenantSettings) =>
      httpClient.request('/tenant/settings', {
        method: 'PATCH',
        body: settings,
        schema: TenantSettingsResponseSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'settings'] });
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<Input, unknown, TenantSettings>({
    resolver: zodResolver(TenantSettingsInputSchema),
    ...(settingsQuery.data === undefined ? {} : { defaultValues: settingsQuery.data.settings }),
  });
  const allowMultipleUnits = useWatch({ control, name: 'allowMultipleUnits' });

  useEffect(() => {
    if (settingsQuery.data !== undefined) {
      reset(settingsQuery.data.settings);
    }
  }, [reset, settingsQuery.data]);

  const treatmentPlanSingular =
    experienceQuery.data?.terminology.treatmentPlanSingular ?? 'orçamento';

  return (
    <section className="tenant-settings tenant-settings--redesigned">
      <PageHeader
        title="Preferências"
        description="Configure como o estabelecimento funciona, agenda e apresenta seus serviços."
      />
      {settingsQuery.isPending ? <p>Carregando configurações…</p> : null}
      {settingsQuery.error instanceof Error ? (
        <InlineAlert tone="danger">Não foi possível carregar as configurações.</InlineAlert>
      ) : null}
      {!canUpdate ? (
        <InlineAlert tone="warning">
          Você não tem permissão para atualizar as configurações do estabelecimento.
        </InlineAlert>
      ) : null}
      {mutation.isError ? (
        <InlineAlert tone="danger">Não foi possível salvar as configurações.</InlineAlert>
      ) : null}
      {mutation.isSuccess ? (
        <InlineAlert>Configurações atualizadas com sucesso.</InlineAlert>
      ) : null}
      {experienceQuery.error instanceof Error ? (
        <InlineAlert tone="danger">
          Não foi possível carregar as configurações de nomenclatura.
        </InlineAlert>
      ) : null}
      <SectionCard title="Configurações gerais">
        <form
          className="platform-form tenant-settings-form"
          onSubmit={(event) => {
            void handleSubmit(async (value) => {
              await mutation.mutateAsync(value);
            })(event);
          }}
        >
          <fieldset disabled={!canUpdate}>
            <Switch
              checked={allowMultipleUnits ?? false}
              onChange={(checked) => {
                setValue('allowMultipleUnits', checked, { shouldDirty: true });
              }}
              label="Permitir múltiplas unidades"
              disabled={!canUpdate || settingsQuery.isPending}
            />
            <div className="tenant-settings-grid tenant-settings-grid--2">
              <label>
                Primeiro dia da semana
                <select {...register('weekStartsOn')}>
                  <option value="MONDAY">Segunda-feira</option>
                  <option value="SUNDAY">Domingo</option>
                </select>
              </label>
              <label>
                Formato de data
                <select {...register('dateFormat')}>
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                </select>
              </label>
              <label>
                Formato de hora
                <select {...register('timeFormat')}>
                  <option value="24H">24H</option>
                  <option value="12H">12H</option>
                </select>
              </label>
            </div>
            <button
              disabled={mutation.isPending || settingsQuery.isPending || !canUpdate}
              type="submit"
            >
              {mutation.isPending ? 'Salvando…' : 'Salvar configurações'}
            </button>
          </fieldset>
        </form>
      </SectionCard>
      <SectionCard
        title="Agenda e horários"
        description="Defina intervalos e limites usados na disponibilidade de agendamentos."
      >
        <form
          className="platform-form tenant-settings-form"
          onSubmit={(event) => {
            void handleSubmit(async (value) => {
              await mutation.mutateAsync(value);
            })(event);
          }}
        >
          <fieldset disabled={!canUpdate}>
            <div className="tenant-settings-grid tenant-settings-grid--3">
              <label>
                Intervalo padrão de agendamento (minutos)
                <select {...register('defaultAppointmentIntervalMinutes')}>
                  {[5, 10, 15, 20, 30, 60].map((interval) => (
                    <option key={interval} value={interval}>
                      {interval}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Antecedência mínima (minutos)
                <input
                  type="number"
                  min={0}
                  max={43200}
                  step={1}
                  {...register('minimumAdvanceMinutes', { valueAsNumber: true })}
                />
              </label>
              <label>
                Antecedência máxima (dias)
                <input
                  type="number"
                  min={1}
                  max={365}
                  step={1}
                  {...register('maximumAdvanceDays', { valueAsNumber: true })}
                />
              </label>
            </div>
            <button
              disabled={mutation.isPending || settingsQuery.isPending || !canUpdate}
              type="submit"
            >
              {mutation.isPending ? 'Salvando…' : 'Salvar configurações'}
            </button>
          </fieldset>
        </form>
      </SectionCard>
      {Object.keys(errors).length > 0 ? <p role="alert">Revise os campos do formulário.</p> : null}
      <TreatmentPlansConfigSection
        tenantPublicId={tenantPublicId}
        terminology={experienceQuery.data?.terminology as TenantTerminologyOverrides}
        canUpdate={canUpdate}
      />

      <TreatmentPlansReminderConfigSection
        tenantPublicId={tenantPublicId}
        canUpdate={canUpdate}
        treatmentPlanLabels={{
          singular: treatmentPlanSingular,
        }}
      />
    </section>
  );
}
