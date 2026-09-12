import {
  ProfessionalUnitPublicSchema,
  ProfessionalUnitsResponseSchema,
  ProfessionalUnitStatusResponseSchema,
  TenantUnitsResponseSchema,
  UpsertProfessionalUnitRequestSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';
import { UnitSelect } from '../tenants/UnitSelect.js';
export function ProfessionalUnitLinks({
  tenantPublicId,
  professionalPublicId,
}: {
  tenantPublicId: string;
  professionalPublicId: string;
}) {
  const client = useQueryClient();
  const [target, setTarget] = useState('');
  const url = `/tenant/professionals/${professionalPublicId}/units`;
  const links = useQuery({
    queryKey: ['professional-units', url],
    queryFn: () =>
      httpClient.request(url, { schema: ProfessionalUnitsResponseSchema, tenantPublicId }),
  });
  const units = useQuery({
    queryKey: ['tenant', tenantPublicId, 'units'],
    queryFn: () =>
      httpClient.request('/tenant/units', { schema: TenantUnitsResponseSchema, tenantPublicId }),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ['professional-units', url] });
  const save = useMutation({
    mutationFn: () =>
      httpClient.request(url, {
        method: 'PUT',
        body: UpsertProfessionalUnitRequestSchema.parse({ unitPublicId: target, active: true }),
        schema: ProfessionalUnitPublicSchema,
        tenantPublicId,
      }),
    onSuccess: refresh,
  });
  const status = useMutation({
    mutationFn: (item: { unitId: string; active: boolean }) =>
      httpClient.request(`${url}/${item.unitId}/${item.active ? 'activate' : 'deactivate'}`, {
        method: 'POST',
        schema: ProfessionalUnitStatusResponseSchema,
        tenantPublicId,
      }),
    onSuccess: refresh,
  });
  return (
    <section className="platform-form professional-settings-card">
      <header className="settings-card-header">
        <div><span className="settings-card-icon" aria-hidden="true">⌂</span><div><h4>Unidades de atendimento</h4><p>Escolha onde este profissional atende.</p></div></div>
      </header>
      <UnitSelect
        emptyLabel="Selecionar unidade"
        onlyActive
        tenantPublicId={tenantPublicId}
        value={target}
        onChange={setTarget}
      />
      <button
        disabled={target === '' || save.isPending}
        type="button"
        onClick={() => void save.mutateAsync()}
      >
        Salvar
      </button>
      {links.data?.items.map((x) => (
        <div key={x.publicId}>
          <span>{units.data?.units.find((unit) => unit.publicId === x.unitPublicId)?.name ?? 'Unidade'}</span>
          <span>{x.active ? ' Ativo' : ' Inativo'}</span>
          <button
            type="button"
            onClick={() => void status.mutateAsync({ unitId: x.unitPublicId, active: !x.active })}
          >
            {x.active ? 'Desativar' : 'Ativar'}
          </button>
        </div>
      ))}
    </section>
  );
}
