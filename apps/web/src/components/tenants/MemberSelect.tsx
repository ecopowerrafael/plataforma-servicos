import { MembershipListPaginatedResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';

import { httpClient } from '../../lib/http.js';

export function MemberSelect({
  tenantPublicId,
  value,
  onChange,
  emptyLabel = 'Nenhum usuário vinculado',
  disabled,
}: {
  tenantPublicId: string;
  value: string;
  onChange: (userPublicId: string) => void;
  emptyLabel?: string;
  disabled?: boolean;
}) {
  const membersQuery = useQuery({
    queryKey: ['tenant', tenantPublicId, 'members', 'select'],
    queryFn: () =>
      httpClient.request('/tenant/members?limit=100', {
        schema: MembershipListPaginatedResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const members = membersQuery.data?.members ?? [];

  return (
    <select
      disabled={disabled === true || membersQuery.isPending}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    >
      <option value="">{emptyLabel}</option>
      {members.map((member) => (
        <option key={member.user.publicId} value={member.user.publicId}>
          {`${member.user.email} (${member.roleCode})`}
        </option>
      ))}
    </select>
  );
}
