import {
  CreateInvitationRequestSchema,
  InvitationListResponseSchema,
  InvitationPublicSchema,
  MembershipListPaginatedResponseSchema,
  MembershipPublicSchema,
  SuccessResponseSchema,
  UpdateMembershipRequestSchema,
  TenantUnitsResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient, HttpError } from '../../lib/http.js';

const assignableRoles = ['MANAGER', 'RECEPTIONIST', 'PROFESSIONAL'] as const;
const roleLabel: Record<(typeof assignableRoles)[number] | 'OWNER', string> = {
  OWNER: 'Proprietário',
  MANAGER: 'Gerente',
  RECEPTIONIST: 'Recepcionista',
  PROFESSIONAL: 'Profissional',
};
const statusLabel: Record<string, string> = {
  ACTIVE: 'Ativo',
  INVITED: 'Convidado',
  SUSPENDED: 'Suspenso',
  INACTIVE: 'Inativo',
};

export function MembersModule({
  tenantPublicId,
  canManage,
}: {
  tenantPublicId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<(typeof assignableRoles)[number]>('RECEPTIONIST');

  const membersQueryKey = ['tenant', tenantPublicId, 'members'];
  const members = useQuery({
    queryKey: membersQueryKey,
    queryFn: () =>
      httpClient.request('/tenant/members?limit=100', {
        schema: MembershipListPaginatedResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const units = useQuery({
    queryKey: ['tenant', tenantPublicId, 'units'],
    queryFn: () =>
      httpClient.request('/tenant/units', { schema: TenantUnitsResponseSchema, tenantPublicId }),
  });

  const invitationsQueryKey = ['tenant', tenantPublicId, 'members', 'invitations'];
  const invitations = useQuery({
    queryKey: invitationsQueryKey,
    queryFn: () =>
      httpClient.request('/tenant/members/invitations', {
        schema: InvitationListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
    enabled: canManage,
  });

  const invalidateMembers = () => queryClient.invalidateQueries({ queryKey: membersQueryKey });
  const invalidateInvitations = () =>
    queryClient.invalidateQueries({ queryKey: invitationsQueryKey });

  const invite = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/members/invitations', {
        method: 'POST',
        body: CreateInvitationRequestSchema.parse({ email: inviteEmail, roleCode: inviteRole }),
        schema: InvitationPublicSchema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      setInviteEmail('');
      await invalidateInvitations();
    },
  });

  const revokeInvitation = useMutation({
    mutationFn: (invitationPublicId: string) =>
      httpClient.request(`/tenant/members/invitations/${invitationPublicId}`, {
        method: 'DELETE',
        schema: SuccessResponseSchema,
        tenantPublicId,
      }),
    onSuccess: invalidateInvitations,
  });

  const updateMembership = useMutation({
    mutationFn: ({ membershipPublicId, body }: { membershipPublicId: string; body: unknown }) =>
      httpClient.request(`/tenant/members/${membershipPublicId}`, {
        method: 'PATCH',
        body: UpdateMembershipRequestSchema.parse(body),
        schema: MembershipPublicSchema,
        tenantPublicId,
      }),
    onSuccess: invalidateMembers,
  });

  const busy = invite.isPending || revokeInvitation.isPending || updateMembership.isPending;
  const mutationError = invite.error ?? revokeInvitation.error ?? updateMembership.error;
  const errorMessage =
    mutationError instanceof HttpError
      ? mutationError.message
      : mutationError instanceof Error
        ? mutationError.message
        : null;

  return (
    <section className="app-card members-module" aria-label="Membros do estabelecimento">
      <h3>Membros</h3>
      {members.isPending ? <p>Carregando membros…</p> : null}
      {members.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar os membros.</p>
      ) : null}
      {errorMessage !== null && (
        <p className="form-error" role="alert">
          {errorMessage}
        </p>
      )}
      <ul>
        {members.data?.members.map((member) => (
          <li key={member.publicId}>
            <strong>{member.user.email}</strong>
            {canManage && !member.isOwner ? (
              <select
                disabled={busy}
                value={member.roleCode}
                onChange={(event) => {
                  updateMembership.mutate({
                    membershipPublicId: member.publicId,
                    body: { roleCode: event.target.value },
                  });
                }}
              >
                {assignableRoles.map((role) => (
                  <option key={role} value={role}>
                    {roleLabel[role]}
                  </option>
                ))}
              </select>
            ) : (
              <span>{roleLabel[member.roleCode as keyof typeof roleLabel]}</span>
            )}
            <span>{statusLabel[member.status] ?? member.status}</span>
            {canManage && !member.isOwner ? (
              <label>
                Unidades
                <select
                  multiple
                  value={
                    member.unitPublicIds ?? units.data?.units.map((unit) => unit.publicId) ?? []
                  }
                  onChange={(event) => {
                    const selected = [...event.currentTarget.selectedOptions].map(
                      ({ value }) => value,
                    );
                    updateMembership.mutate({
                      membershipPublicId: member.publicId,
                      body: {
                        unitPublicIds:
                          selected.length === units.data?.units.length ? null : selected,
                      },
                    });
                  }}
                >
                  {units.data?.units.map((unit) => (
                    <option key={unit.publicId} value={unit.publicId}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {canManage &&
              !member.isOwner &&
              (member.status === 'ACTIVE' || member.status === 'SUSPENDED') && (
                <button
                  disabled={busy}
                  type="button"
                  onClick={() => {
                    updateMembership.mutate({
                      membershipPublicId: member.publicId,
                      body: { status: member.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' },
                    });
                  }}
                >
                  {member.status === 'ACTIVE' ? 'Suspender' : 'Reativar'}
                </button>
              )}
          </li>
        ))}
      </ul>

      {canManage && (
        <>
          <h4>Convidar membro</h4>
          <div className="form-actions">
            <label>
              E-mail
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => {
                  setInviteEmail(event.target.value);
                }}
              />
            </label>
            <label>
              Papel
              <select
                value={inviteRole}
                onChange={(event) => {
                  setInviteRole(event.target.value as (typeof assignableRoles)[number]);
                }}
              >
                {assignableRoles.map((role) => (
                  <option key={role} value={role}>
                    {roleLabel[role]}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={busy || inviteEmail === ''}
              type="button"
              onClick={() => {
                invite.mutate();
              }}
            >
              {invite.isPending ? 'Enviando…' : 'Convidar'}
            </button>
          </div>

          <h4>Convites pendentes</h4>
          {invitations.isPending ? <p>Carregando convites…</p> : null}
          {invitations.error instanceof Error ? (
            <p className="form-error">Não foi possível carregar os convites.</p>
          ) : null}
          {invitations.data?.invitations.length === 0 ? <p>Nenhum convite pendente.</p> : null}
          <ul>
            {invitations.data?.invitations.map((invitation) => (
              <li key={invitation.publicId}>
                <span>{`${invitation.email} — ${roleLabel[invitation.roleCode]}`}</span>
                <button
                  disabled={busy}
                  type="button"
                  onClick={() => {
                    revokeInvitation.mutate(invitation.publicId);
                  }}
                >
                  Revogar
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
