import {
  MembershipListPaginatedResponseSchema,
  type ProfessionalPublicSchema,
} from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { type z } from 'zod';

import { TenantProfessionalPhoto } from './TenantProfessionalPhoto.js';
import { httpClient } from '../../lib/http.js';

type Professional = z.infer<typeof ProfessionalPublicSchema>;
export type ProfessionalTab = 'profile' | 'services' | 'schedule' | 'commission' | 'access';

export function ProfessionalProfileSkeleton() {
  return (
    <div className="profile-skeleton" aria-label="Carregando perfil">
      <span />
      <span />
      <span />
    </div>
  );
}

export function ProfileHeader({
  professional,
  unitName,
  tenantPublicId,
  onEdit,
  onPhoto,
  onAgenda,
}: {
  professional: Professional;
  unitName: string | null;
  tenantPublicId: string;
  onEdit: () => void;
  onPhoto: (file: File) => void;
  onAgenda: () => void;
}) {
  const specialty = professional.specialties[0];
  return (
    <header className="profile-hero">
      <TenantProfessionalPhoto
        name={professional.publicName}
        professionalPublicId={professional.publicId}
        tenantPublicId={tenantPublicId}
        size="large"
        version={professional.updatedAt}
      />
      <div className="profile-hero-copy">
        <p className="eyebrow">Perfil profissional</p>
        <h2>{professional.publicName}</h2>
        <div className="profile-hero-meta">
          {specialty !== undefined && <span>{specialty}</span>}
          <span className={`profile-status ${professional.active ? 'active' : 'inactive'}`}>
            {professional.active ? 'Ativo' : 'Inativo'}
          </span>
          {unitName !== null && <span>{unitName}</span>}
        </div>
      </div>
      <div className="profile-hero-actions">
        <button className="secondary-button" type="button" onClick={onEdit}>
          Editar perfil
        </button>
        <button className="primary-button" type="button" onClick={onAgenda}>
          Ver agenda
        </button>
        <label className="profile-photo-action">
          Alterar foto
          <input
            accept="image/jpeg,image/png,image/webp"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) onPhoto(file);
            }}
          />
        </label>
      </div>
    </header>
  );
}

export function ProfileTabs({
  value,
  onChange,
}: {
  value: ProfessionalTab;
  onChange: (tab: ProfessionalTab) => void;
}) {
  const tabs: readonly [ProfessionalTab, string][] = [
    ['profile', 'Perfil'],
    ['services', 'Serviços'],
    ['schedule', 'Agenda'],
    ['commission', 'Comissões'],
    ['access', 'Acesso'],
  ];
  return (
    <nav className="profile-tabs" aria-label="Seções do profissional">
      {tabs.map(([id, label]) => (
        <button
          className={value === id ? 'active' : ''}
          aria-current={value === id ? 'page' : undefined}
          key={id}
          type="button"
          onClick={() => {
            onChange(id);
          }}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

function ProfileField({
  label,
  children,
  empty = 'Não informado',
}: {
  label: string;
  children: ReactNode;
  empty?: string;
}) {
  const value = typeof children === 'string' && children.trim() === '' ? empty : children;
  return (
    <div className="profile-field">
      <dt>{label}</dt>
      <dd>{value ?? empty}</dd>
    </div>
  );
}

export function ProfileOverview({
  professional,
  unitName,
  onEdit,
}: {
  professional: Professional;
  unitName: string | null;
  onEdit: () => void;
}) {
  return (
    <div className="profile-overview-grid">
      <section className="profile-section profile-section--wide">
        <header>
          <div>
            <p className="eyebrow">Perfil</p>
            <h3>Informações profissionais</h3>
          </div>
          <button className="secondary-button" type="button" onClick={onEdit}>
            Editar informações
          </button>
        </header>
        <dl className="profile-field-grid">
          <ProfileField label="Nome">{professional.name}</ProfileField>
          <ProfileField label="Nome de exibição">{professional.publicName}</ProfileField>
          <ProfileField label="Especialidades">{professional.specialties.join(' · ')}</ProfileField>
          <ProfileField label="Status">{professional.active ? 'Ativo' : 'Inativo'}</ProfileField>
          <ProfileField label="Biografia">{professional.bio}</ProfileField>
          <ProfileField label="Documento profissional">
            {professional.professionalDocument}
          </ProfileField>
        </dl>
      </section>
      <section className="profile-section">
        <header>
          <div>
            <p className="eyebrow">Contato</p>
            <h3>Dados de contato</h3>
          </div>
        </header>
        <dl>
          <ProfileField label="Telefone">{professional.phone}</ProfileField>
          <ProfileField label="E-mail">{professional.email}</ProfileField>
        </dl>
      </section>
      <section className="profile-section">
        <header>
          <div>
            <p className="eyebrow">Local</p>
            <h3>Local de trabalho</h3>
          </div>
        </header>
        <dl>
          <ProfileField label="Unidade principal">{unitName}</ProfileField>
          <ProfileField label="Cor na agenda">
            <span className="profile-color">
              <i style={{ background: professional.calendarColor }} />
              {professional.calendarColor}
            </span>
          </ProfileField>
        </dl>
      </section>
    </div>
  );
}

export function CommissionOverview({
  professional,
  onEdit,
}: {
  professional: Professional;
  onEdit: () => void;
}) {
  const amount =
    professional.commissionType === 'PERCENTAGE'
      ? `${String(professional.commissionValue)}%`
      : (professional.commissionValue / 100).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        });
  return (
    <section className="profile-section commission-summary">
      <header>
        <div>
          <p className="eyebrow">Regra padrão</p>
          <h3>Comissão atual</h3>
        </div>
        <button className="secondary-button" type="button" onClick={onEdit}>
          Editar regra
        </button>
      </header>
      <strong>{amount}</strong>
      <p>
        {professional.commissionType === 'PERCENTAGE'
          ? 'Percentual aplicado conforme a regra do profissional.'
          : 'Valor fixo configurado para o profissional.'}
      </p>
    </section>
  );
}

const accessLabels: Record<string, string> = {
  OWNER: 'Proprietário',
  MANAGER: 'Gerente',
  RECEPTIONIST: 'Recepção',
  PROFESSIONAL: 'Profissional',
};
export function AccessOverview({
  professional,
  tenantPublicId,
  onEdit,
}: {
  professional: Professional;
  tenantPublicId: string;
  onEdit: () => void;
}) {
  const members = useQuery({
    queryKey: ['tenant', tenantPublicId, 'members', 'professional-access'],
    queryFn: () =>
      httpClient.request('/tenant/members?limit=100', {
        schema: MembershipListPaginatedResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  if (members.isPending) return <ProfessionalProfileSkeleton />;
  if (members.error instanceof Error)
    return (
      <div className="profile-inline-error">
        <strong>Não foi possível carregar o acesso.</strong>
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            void members.refetch();
          }}
        >
          Tentar novamente
        </button>
      </div>
    );
  const member = members.data?.members.find(
    (item) => item.user.publicId === professional.userPublicId,
  );
  if (professional.userPublicId === null || member === undefined)
    return (
      <section className="profile-section access-empty">
        <span aria-hidden="true">◇</span>
        <h3>Sem acesso ao aplicativo</h3>
        <p>
          Este cadastro existe como profissional, mas ainda não está vinculado a uma conta do
          sistema.
        </p>
        <button className="primary-button" type="button" onClick={onEdit}>
          Vincular conta existente
        </button>
      </section>
    );
  return (
    <div className="profile-overview-grid">
      <section className="profile-section">
        <header>
          <div>
            <p className="eyebrow">Conta</p>
            <h3>Acesso ao sistema</h3>
          </div>
          <button className="secondary-button" type="button" onClick={onEdit}>
            Editar vínculo
          </button>
        </header>
        <dl>
          <ProfileField label="E-mail">{member.user.email}</ProfileField>
          <ProfileField label="Status">
            {member.status === 'ACTIVE'
              ? 'Acesso ativo'
              : member.status === 'INVITED'
                ? 'Convite pendente'
                : member.status === 'SUSPENDED'
                  ? 'Acesso suspenso'
                  : 'Acesso inativo'}
          </ProfileField>
        </dl>
      </section>
      <section className="profile-section">
        <header>
          <div>
            <p className="eyebrow">Permissões</p>
            <h3>Papel da conta</h3>
          </div>
        </header>
        <dl>
          <ProfileField label="Papel">
            {accessLabels[member.roleCode] ?? member.roleCode}
          </ProfileField>
          <ProfileField label="Escopo de unidades">
            {member.unitPublicIds === null || member.unitPublicIds === undefined
              ? 'Todas as unidades'
              : `${String(member.unitPublicIds.length)} unidade(s)`}
          </ProfileField>
        </dl>
      </section>
    </div>
  );
}
