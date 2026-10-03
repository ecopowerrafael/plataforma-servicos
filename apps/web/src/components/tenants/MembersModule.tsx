import {
  CreateInvitationRequestSchema,
  InvitationListResponseSchema,
  InvitationPublicSchema,
  MembershipListPaginatedResponseSchema,
  MembershipPublicSchema,
  SuccessResponseSchema,
  TenantUnitsResponseSchema,
  UpdateMembershipRequestSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { httpClient, HttpError } from '../../lib/http.js';
import { InlineAlert, ListSkeleton, PageHeader, StatusBadge } from '../ui/AppUi.js';
import '../../styles/tenants-additional.css';

const assignableRoles = ['MANAGER', 'RECEPTIONIST', 'PROFESSIONAL'] as const;
type AssignableRole = (typeof assignableRoles)[number];
const roleLabel: Record<AssignableRole | 'OWNER', string> = {
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
function statusTone(status: string): 'success' | 'warning' | 'danger' | 'info' | 'muted' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'SUSPENDED') return 'warning';
  if (status === 'INVITED') return 'info';
  return 'muted';
}
function friendlyError(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  if (
    error instanceof HttpError &&
    error.message &&
    !/\b(HTTP|fetch|status code|500)\b/i.test(error.message)
  )
    return error.message;
  return 'Não foi possível concluir a operação. Tente novamente.';
}

export function MembersModule({
  tenantPublicId,
  canManage,
}: {
  tenantPublicId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AssignableRole>('RECEPTIONIST');
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const membersQueryKey = ['tenant', tenantPublicId, 'members'];
  const invitationsQueryKey = ['tenant', tenantPublicId, 'members', 'invitations'];
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
      setInviteSuccess(true);
      await invalidateInvitations();
    },
  });
  const revokeInvitation = useMutation({
    mutationFn: (id: string) =>
      httpClient.request(`/tenant/members/invitations/${id}`, {
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
  const membersList = members.data?.members ?? [];
  const unitList = units.data?.units ?? [];
  const updateId = updateMembership.variables?.membershipPublicId;
  const errorMessage = friendlyError(
    invite.error ?? revokeInvitation.error ?? updateMembership.error,
  );
  const updateUnits = (id: string, selected: string[]) =>
    updateMembership.mutate({
      membershipPublicId: id,
      body: { unitPublicIds: selected.length === unitList.length ? null : selected },
    });
  return (
    <section className="members-module--redesigned" aria-label="Membros do estabelecimento">
      <PageHeader
        eyebrow="EQUIPE"
        title="Membros"
        description="Gerencie quem pode acessar o estabelecimento e quais permissões cada pessoa possui."
      />
      {errorMessage ? <InlineAlert tone="danger">{errorMessage}</InlineAlert> : null}
      <div className="members-stats" aria-label="Resumo da equipe">
        <article className="members-stat-card">
          <strong>{membersList.length}</strong>
          <span>Membros</span>
        </article>
        <article className="members-stat-card">
          <strong>{membersList.filter((member) => member.status === 'ACTIVE').length}</strong>
          <span>Ativos</span>
        </article>
        <article className="members-stat-card">
          <strong>{invitations.data?.invitations.length ?? 0}</strong>
          <span>Convites pendentes</span>
        </article>
      </div>
      <section className="members-list-card" aria-labelledby="members-current-title">
        <header className="members-list-header">
          <div>
            <h3 id="members-current-title">Membros atuais</h3>
            <p>Pessoas que já possuem acesso ao estabelecimento.</p>
          </div>
        </header>
        {members.isPending ? <ListSkeleton rows={4} /> : null}
        {members.error instanceof Error ? (
          <InlineAlert tone="danger">Não foi possível carregar os membros.</InlineAlert>
        ) : null}
        {!members.isPending && !members.error ? (
          <>
            <div className="members-table-header" aria-hidden="true">
              <span>USUÁRIO</span>
              <span>PAPEL</span>
              <span>STATUS</span>
              <span>UNIDADES</span>
              <span>AÇÃO</span>
            </div>
            <div className="members-rows">
              {membersList.map((member) => {
                const allUnits =
                  member.unitPublicIds === null || member.unitPublicIds === undefined;
                const selectedUnits = allUnits
                  ? unitList.map((unit) => unit.publicId)
                  : member.unitPublicIds;
                const rowBusy = updateMembership.isPending && updateId === member.publicId;
                return (
                  <article className="members-row" key={member.publicId}>
                    <div className="members-user">
                      <span className="members-avatar" aria-hidden="true">
                        {member.user.email.slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <strong>{member.user.email}</strong>
                        {member.isOwner ? <small>Proprietário da conta</small> : null}
                      </div>
                    </div>
                    <div className="members-role">
                      {canManage && !member.isOwner ? (
                        <select
                          aria-label={`Papel de ${member.user.email}`}
                          disabled={rowBusy}
                          value={member.roleCode}
                          onChange={(event) =>
                            updateMembership.mutate({
                              membershipPublicId: member.publicId,
                              body: { roleCode: event.target.value },
                            })
                          }
                        >
                          {assignableRoles.map((role) => (
                            <option key={role} value={role}>
                              {roleLabel[role]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span>
                          {roleLabel[member.roleCode as keyof typeof roleLabel]}
                          {member.isOwner ? <em>OWNER</em> : null}
                        </span>
                      )}
                    </div>
                    <div className="members-status">
                      <StatusBadge tone={statusTone(member.status)}>
                        {statusLabel[member.status] ?? 'Status indisponível'}
                      </StatusBadge>
                    </div>
                    <div className="members-units">
                      {canManage && !member.isOwner && unitList.length > 1 ? (
                        <details>
                          <summary>
                            {allUnits ? 'Todas as unidades' : `${selectedUnits.length} unidades`}
                          </summary>
                          <div className="members-units-menu">
                            {unitList.map((unit) => (
                              <label key={unit.publicId}>
                                <input
                                  type="checkbox"
                                  checked={selectedUnits.includes(unit.publicId)}
                                  disabled={rowBusy}
                                  onChange={(event) =>
                                    updateUnits(
                                      member.publicId,
                                      event.target.checked
                                        ? [...selectedUnits, unit.publicId]
                                        : selectedUnits.filter((id) => id !== unit.publicId),
                                    )
                                  }
                                />
                                {unit.name}
                              </label>
                            ))}
                          </div>
                        </details>
                      ) : (
                        <span>
                          {unitList.length === 1
                            ? (unitList[0]?.name ?? 'Unidade')
                            : allUnits
                              ? 'Todas as unidades'
                              : `${selectedUnits.length} unidades`}
                        </span>
                      )}
                    </div>
                    <div className="members-action">
                      {canManage &&
                      !member.isOwner &&
                      (member.status === 'ACTIVE' || member.status === 'SUSPENDED') ? (
                        <button
                          className={
                            member.status === 'ACTIVE'
                              ? 'members-button members-button--danger'
                              : 'members-button'
                          }
                          disabled={rowBusy}
                          type="button"
                          onClick={() =>
                            updateMembership.mutate({
                              membershipPublicId: member.publicId,
                              body: { status: member.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' },
                            })
                          }
                        >
                          {member.status === 'ACTIVE' ? 'Suspender' : 'Reativar'}
                        </button>
                      ) : (
                        <span>{member.isOwner ? 'Conta principal' : '—'}</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        ) : null}
      </section>
      {canManage ? (
        <>
          <section className="members-invite-card" aria-labelledby="members-invite-title">
            <header>
              <h3 id="members-invite-title">Convidar membro</h3>
              <p>Envie um convite para uma pessoa acessar este estabelecimento.</p>
            </header>
            <div className="members-invite-form">
              <label>
                E-mail
                <input
                  type="email"
                  placeholder="nome@empresa.com"
                  value={inviteEmail}
                  onChange={(event) => {
                    setInviteEmail(event.target.value);
                    setInviteSuccess(false);
                  }}
                />
              </label>
              <label>
                Papel
                <select
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value as AssignableRole)}
                >
                  {assignableRoles.map((role) => (
                    <option key={role} value={role}>
                      {roleLabel[role]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="members-button members-button--primary"
                disabled={invite.isPending || inviteEmail.trim() === ''}
                type="button"
                onClick={() => invite.mutate()}
              >
                {invite.isPending ? 'Enviando…' : 'Enviar convite'}
              </button>
            </div>
            <p className="members-form-hint">
              Você poderá alterar o papel do membro depois que ele entrar na equipe.
            </p>
            {inviteSuccess ? (
              <p className="members-success" role="status">
                Convite enviado com sucesso.
              </p>
            ) : null}
          </section>
          <section className="members-invitations-card" aria-labelledby="members-invitations-title">
            <header>
              <h3 id="members-invitations-title">Convites pendentes</h3>
              <p>Convites enviados que ainda não foram aceitos.</p>
            </header>
            {invitations.isPending ? <ListSkeleton rows={2} /> : null}
            {invitations.error instanceof Error ? (
              <InlineAlert tone="danger">Não foi possível carregar os convites.</InlineAlert>
            ) : null}
            {invitations.data?.invitations.length === 0 ? (
              <div className="members-empty-invitations" role="status">
                <strong>✓ Nenhum convite pendente</strong>
                <span>Todos os convites enviados já foram resolvidos.</span>
              </div>
            ) : null}
            {invitations.data?.invitations.map((invitation) => (
              <div className="members-invitation-row" key={invitation.publicId}>
                <span>
                  <strong>{invitation.email}</strong>
                  <small>{roleLabel[invitation.roleCode as keyof typeof roleLabel]}</small>
                </span>
                <button
                  className="members-button members-button--danger"
                  disabled={
                    revokeInvitation.isPending && revokeInvitation.variables === invitation.publicId
                  }
                  type="button"
                  onClick={() => revokeInvitation.mutate(invitation.publicId)}
                >
                  {revokeInvitation.isPending && revokeInvitation.variables === invitation.publicId
                    ? 'Revogando…'
                    : 'Revogar convite'}
                </button>
              </div>
            ))}
          </section>
        </>
      ) : null}
    </section>
  );
}
