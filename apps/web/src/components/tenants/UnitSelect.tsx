import { TenantUnitsResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';

import { httpClient } from '../../lib/http.js';

export function UnitSelect({
  tenantPublicId,
  value,
  onChange,
  includeAllOption = true,
  emptyLabel = 'Todas as unidades',
  onlyActive = false,
  disabled,
}: {
  tenantPublicId: string;
  value: string;
  onChange: (unitPublicId: string) => void;
  includeAllOption?: boolean;
  emptyLabel?: string;
  onlyActive?: boolean;
  disabled?: boolean;
}) {
  const unitsQuery = useQuery({
    queryKey: ['tenant', tenantPublicId, 'units'],
    queryFn: () =>
      httpClient.request('/tenant/units', {
        schema: TenantUnitsResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const units = (unitsQuery.data?.units ?? []).filter(
    (unit) => !onlyActive || unit.status === 'ACTIVE',
  );

  return (
    <select
      disabled={disabled === true || unitsQuery.isPending}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    >
      {includeAllOption ? <option value="">{emptyLabel}</option> : null}
      {units.map((unit) => (
        <option key={unit.publicId} value={unit.publicId}>
          {unit.name}
          {unit.isHeadquarters ? ' (matriz)' : ''}
          {unit.status === 'INACTIVE' ? ' — inativa' : ''}
        </option>
      ))}
    </select>
  );
}
