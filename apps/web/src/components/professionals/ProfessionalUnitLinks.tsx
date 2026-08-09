import {
  ProfessionalUnitPublicSchema,
  ProfessionalUnitsResponseSchema,
  ProfessionalUnitStatusResponseSchema,
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
    <section className="platform-form">
      <h4>Unidades</h4>
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
          <span>{x.unitPublicId}</span>
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
