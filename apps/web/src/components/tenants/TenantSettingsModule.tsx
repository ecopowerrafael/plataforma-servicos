import { zodResolver } from '@hookform/resolvers/zod';
import {
  TenantSettingsInputSchema,
  TenantSettingsResponseSchema,
  TenantExperienceResponseSchema,
  type TenantSettings,
  type TenantTerminologyOverrides,
} from '@plataforma/shared';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type z } from 'zod';

import { TreatmentPlansConfigSection } from '../treatment-plans/TreatmentPlansConfigSection.js';
import { httpClient } from '../../lib/http.js';

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
      queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'settings'] });
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Input, unknown, TenantSettings>({
    resolver: zodResolver(TenantSettingsInputSchema),
    ...(settingsQuery.data === undefined ? {} : { defaultValues: settingsQuery.data.settings }),
  });

  useEffect(() => {
    if (settingsQuery.data !== undefined) {
      reset(settingsQuery.data.settings);
    }
  }, [reset, settingsQuery.data]);

  return (
    <section className="module-card">
      <h2>Configurações do estabelecimento</h2>
      {settingsQuery.isPending ? <p>Carregando configurações…</p> : null}
      {settingsQuery.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar as configurações do estabelecimento.</p>
      ) : null}
      {!canUpdate ? (
        <p className="form-note">
          Você não tem permissão para atualizar as configurações do estabelecimento.
        </p>
      ) : null}
      {mutation.isError ? (
        <p className="form-error">Não foi possível salvar as configurações.</p>
      ) : null}
      {mutation.isSuccess ? <p>Configurações atualizadas com sucesso.</p> : null}
      <form
        className="platform-form"
        onSubmit={handleSubmit(async (value) => {
          await mutation.mutateAsync(value);
        })}
      >
        <fieldset disabled={!canUpdate}>
          <label>
            Permitir múltiplas unidades
            <input type="checkbox" {...register('allowMultipleUnits')} />
          </label>
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
        </fieldset>
        {Object.keys(errors).length > 0 ? (
          <p role="alert">Revise os campos do formulário.</p>
        ) : null}
        <button
          disabled={mutation.isPending || settingsQuery.isPending || !canUpdate}
          type="submit"
        >
          Salvar configurações
        </button>
      </form>

      <TreatmentPlansConfigSection
        tenantPublicId={tenantPublicId}
        terminology={experienceQuery.data?.terminology as TenantTerminologyOverrides}
        canUpdate={canUpdate}
      />
    </section>
  );
}
