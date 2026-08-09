import {
  TenantUnitResponseSchema,
  TenantUnitsResponseSchema,
  type CreateBusinessUnitRequestSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type z } from 'zod';

import { httpClient, HttpError } from '../../lib/http.js';
import { ConfirmationDialog, type ConfirmationRequest } from '../ConfirmationDialog.js';
import { BusinessUnitDateOverrides } from './BusinessUnitDateOverrides.js';
import { BusinessUnitForm } from './BusinessUnitForm.js';
import { BusinessUnitOperatingHours } from './BusinessUnitOperatingHours.js';

export function UnitsModule({
  tenantPublicId,
  canManage,
}: {
  tenantPublicId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);

  const list = useQuery({
    queryKey: ['tenant', tenantPublicId, 'units'],
    queryFn: () =>
      httpClient.request('/tenant/units', {
        schema: TenantUnitsResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const selectedUnit = list.data?.units.find((unit) => unit.publicId === selected);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'units'] });

  const saveMutation = useMutation({
    mutationFn: (input: { body: unknown; url: string; method: 'POST' | 'PATCH' }) =>
      httpClient.request(input.url, {
        method: input.method,
        body: input.body,
        schema: TenantUnitResponseSchema,
        tenantPublicId,
      }),
    onSuccess: async (result) => {
      await invalidate();
      setSelected(result.unit.publicId);
      setCreating(false);
    },
  });

  const actionMutation = useMutation({
    mutationFn: (input: { url: string }) =>
      httpClient.request(input.url, {
        method: 'POST',
        schema: TenantUnitResponseSchema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      await invalidate();
    },
  });

  const save = async (value: z.output<typeof CreateBusinessUnitRequestSchema>) => {
    await saveMutation.mutateAsync({
      url: selected === null ? '/tenant/units' : `/tenant/units/${selected}`,
      method: selected === null ? 'POST' : 'PATCH',
      body: value,
    });
  };

  const toggleActive = (unitPublicId: string, active: boolean, isHeadquarters: boolean) => {
    if (isHeadquarters && !active) {
      setConfirmation({
        title: 'Não é possível desativar',
        description:
          'A unidade matriz não pode ser desativada. Defina outra unidade como matriz primeiro.',
        confirmLabel: 'Entendi',
        requiresReason: false,
        onConfirm: () => Promise.resolve(),
      });
      return;
    }
    setConfirmation({
      title: active ? 'Ativar unidade?' : 'Desativar unidade?',
      description: active
        ? 'A unidade voltará a estar disponível para operação.'
        : 'A unidade deixará de estar disponível para agendamentos, profissionais e clientes.',
      confirmLabel: active ? 'Ativar' : 'Desativar',
      requiresReason: false,
      variant: active ? 'default' : 'danger',
      onConfirm: async () => {
        await actionMutation.mutateAsync({
          url: `/tenant/units/${unitPublicId}/${active ? 'activate' : 'deactivate'}`,
        });
      },
    });
  };

  const setHeadquarters = (unitPublicId: string) => {
    setConfirmation({
      title: 'Definir como matriz?',
      description: 'Esta unidade passará a ser a matriz do estabelecimento.',
      confirmLabel: 'Definir matriz',
      requiresReason: false,
      onConfirm: async () => {
        await actionMutation.mutateAsync({ url: `/tenant/units/${unitPublicId}/set-headquarters` });
      },
    });
  };

  const errorMessage = (error: unknown) =>
    error instanceof HttpError ? error.message : error instanceof Error ? error.message : null;

  return (
    <section className="sessions-panel">
      <p className="eyebrow">Estrutura</p>
      <h2>Unidades</h2>
      {!canManage ? (
        <p className="form-note">Você não tem permissão para gerenciar unidades.</p>
      ) : (
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setCreating((value) => !value);
          }}
        >
          {creating ? 'Fechar criação' : 'Criar unidade'}
        </button>
      )}
      {creating && canManage && (
        <BusinessUnitForm
          busy={saveMutation.isPending}
          error={errorMessage(saveMutation.error)}
          onSave={save}
        />
      )}
      {list.isPending ? <p>Carregando unidades…</p> : null}
      {list.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar as unidades.</p>
      ) : null}
      {list.data?.units.map((unit) => (
        <button
          className="data-row"
          key={unit.publicId}
          type="button"
          onClick={() => {
            setSelected(unit.publicId);
            setCreating(false);
          }}
        >
          <span>
            {unit.name}
            {unit.isHeadquarters ? ' (matriz)' : ''}
          </span>
          <span>{unit.status === 'ACTIVE' ? 'Ativa' : 'Inativa'}</span>
        </button>
      ))}
      {selectedUnit !== undefined && (
        <article className="sessions-panel">
          <h3>{selectedUnit.name}</h3>
          {canManage ? (
            <BusinessUnitForm
              unit={selectedUnit}
              busy={saveMutation.isPending}
              error={errorMessage(saveMutation.error)}
              onSave={save}
            />
          ) : null}
          {canManage && (
            <BusinessUnitOperatingHours
              tenantPublicId={tenantPublicId}
              unitPublicId={selectedUnit.publicId}
            />
          )}
          {canManage && (
            <BusinessUnitDateOverrides
              tenantPublicId={tenantPublicId}
              unitPublicId={selectedUnit.publicId}
            />
          )}
          {canManage && (
            <>
              <button
                disabled={actionMutation.isPending || selectedUnit.status === 'ACTIVE'}
                type="button"
                onClick={() => {
                  toggleActive(selectedUnit.publicId, true, selectedUnit.isHeadquarters);
                }}
              >
                Ativar
              </button>
              <button
                disabled={actionMutation.isPending || selectedUnit.status !== 'ACTIVE'}
                type="button"
                onClick={() => {
                  toggleActive(selectedUnit.publicId, false, selectedUnit.isHeadquarters);
                }}
              >
                Desativar
              </button>
              <button
                disabled={actionMutation.isPending || selectedUnit.isHeadquarters}
                type="button"
                onClick={() => {
                  setHeadquarters(selectedUnit.publicId);
                }}
              >
                Definir como matriz
              </button>
            </>
          )}
          {actionMutation.error instanceof Error ? (
            <p className="form-error">{errorMessage(actionMutation.error)}</p>
          ) : null}
        </article>
      )}
      {confirmation !== null && (
        <ConfirmationDialog
          request={confirmation}
          onClose={() => {
            setConfirmation(null);
          }}
        />
      )}
    </section>
  );
}
