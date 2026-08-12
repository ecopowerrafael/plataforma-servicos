import {
  CreateProfessionalRequestSchema,
  ProfessionalListResponseSchema,
  ProfessionalPublicSchema,
  TenantUnitsResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { ProfessionalForm } from './ProfessionalForm.js';
import {
  AccessOverview,
  CommissionOverview,
  ProfileHeader,
  ProfileOverview,
  ProfileTabs,
  ProfessionalProfileSkeleton,
  type ProfessionalTab,
} from './ProfessionalProfileViews.js';
import { ProfessionalSchedule } from './ProfessionalSchedule.js';
import { ProfessionalServiceLinks } from './ProfessionalServiceLinks.js';
import { ProfessionalUnavailability } from './ProfessionalUnavailability.js';
import { ProfessionalUnitLinks } from './ProfessionalUnitLinks.js';
import { TenantProfessionalPhoto } from './TenantProfessionalPhoto.js';
import { httpClient } from '../../lib/http.js';

const tabs: ProfessionalTab[] = ['profile', 'services', 'schedule', 'commission', 'access'];
const isTab = (value: string | null): value is ProfessionalTab =>
  tabs.includes(value as ProfessionalTab);

export function ProfessionalModule({
  tenantPublicId,
  terminology,
}: {
  tenantPublicId: string;
  terminology: string;
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const client = useQueryClient();
  const selected = id ?? null;
  const requestedTab = params.get('tab');
  const tab: ProfessionalTab = isTab(requestedTab) ? requestedTab : 'profile';
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<'profile' | 'commission' | 'access' | null>(null);
  const [savedMessage, setSavedMessage] = useState(false);
  const list = useQuery({
    queryKey: ['tenant', tenantPublicId, 'professionals'],
    queryFn: () =>
      httpClient.request('/tenant/professionals?limit=100', {
        schema: ProfessionalListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const detail = useQuery({
    queryKey: ['tenant', tenantPublicId, 'professional', selected],
    queryFn: () =>
      httpClient.request(`/tenant/professionals/${selected ?? ''}`, {
        schema: ProfessionalPublicSchema,
        tenantPublicId,
      }),
    enabled: selected !== null,
    retry: false,
  });
  const units = useQuery({
    queryKey: ['tenant', tenantPublicId, 'units', 'professional-profile'],
    queryFn: () =>
      httpClient.request('/tenant/units', { schema: TenantUnitsResponseSchema, tenantPublicId }),
    enabled: selected !== null,
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (input: { url: string; method: 'POST' | 'PATCH'; body: unknown }) =>
      httpClient.request(input.url, {
        method: input.method,
        body: input.body,
        schema: ProfessionalPublicSchema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'professionals'] });
    },
  });
  const save = async (value: unknown) => {
    const out = await mutation.mutateAsync({
      url: selected === null ? '/tenant/professionals' : `/tenant/professionals/${selected}`,
      method: selected === null ? 'POST' : 'PATCH',
      body: CreateProfessionalRequestSchema.parse(value),
    });
    if (selected === null) {
      setCreating(false);
      void navigate(`/app/equipe/profissionais/${out.publicId}`);
    } else {
      setEditing(null);
      setSavedMessage(true);
    }
  };
  const uploadPhoto = async (file: File) => {
    if (selected === null) return;
    const body = new FormData();
    body.set('file', file, file.name);
    await httpClient.request(`/tenant/professionals/${selected}/photo`, {
      method: 'PUT',
      body,
      schema: ProfessionalPublicSchema,
      tenantPublicId,
    });
    await client.invalidateQueries({
      queryKey: ['tenant', tenantPublicId, 'professional', selected],
    });
  };
  const changeTab = (next: ProfessionalTab) => {
    setEditing(null);
    setSavedMessage(false);
    const updated = new URLSearchParams(params);
    updated.set('tab', next);
    setParams(updated);
  };

  if (selected === null)
    return (
      <section className="sessions-panel professional-workspace">
        <header className="professional-workspace-header">
          <div>
            <p className="eyebrow">Equipe</p>
            <h2>{`${terminology}s`}</h2>
            <p>Perfis, especialidades e acesso da sua equipe.</p>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setCreating((value) => !value);
            }}
          >
            {creating ? 'Fechar criação' : `Adicionar ${terminology.toLowerCase()}`}
          </button>
        </header>
        {creating && (
          <ProfessionalForm
            busy={mutation.isPending}
            error={
              mutation.error instanceof Error ? 'Não foi possível salvar as alterações.' : null
            }
            terminology={terminology}
            tenantPublicId={tenantPublicId}
            onSave={save}
          />
        )}
        {list.isPending ? (
          <ProfessionalProfileSkeleton />
        ) : list.error instanceof Error ? (
          <div className="profile-inline-error">
            <strong>Não foi possível carregar os profissionais.</strong>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                void list.refetch();
              }}
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <div className="professional-card-grid">
            {list.data?.items.map((professional) => (
              <article className="professional-card" key={professional.publicId}>
                <TenantProfessionalPhoto
                  name={professional.publicName}
                  professionalPublicId={professional.publicId}
                  tenantPublicId={tenantPublicId}
                />
                <span>
                  <strong>{professional.publicName}</strong>
                  <small>
                    {professional.specialties.length > 0
                      ? professional.specialties.join(' · ')
                      : 'Sem especialidades'}
                  </small>
                </span>
                <span
                  className={`status-badge ${professional.active ? 'status-active' : 'status-muted'}`}
                >
                  {professional.active ? 'Ativo' : 'Inativo'}
                </span>
                <button
                  className="professional-card-link"
                  type="button"
                  onClick={() => {
                    void navigate(`/app/equipe/profissionais/${professional.publicId}`);
                  }}
                >
                  Ver perfil
                </button>
              </article>
            ))}
            {list.data?.items.length === 0 && (
              <div className="empty-state">
                <strong>Nenhum profissional cadastrado</strong>
                <span>Adicione o primeiro perfil da sua equipe.</span>
              </div>
            )}
          </div>
        )}
      </section>
    );

  if (detail.isPending)
    return (
      <section className="professional-profile-page">
        <ProfessionalProfileSkeleton />
      </section>
    );
  if (detail.error instanceof Error || detail.data === undefined)
    return (
      <section className="professional-profile-page">
        <button
          className="profile-back"
          type="button"
          onClick={() => {
            void navigate('/app/equipe/profissionais');
          }}
        >
          ← Profissionais
        </button>
        <div className="profile-inline-error">
          <strong>Não foi possível carregar o perfil.</strong>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              void detail.refetch();
            }}
          >
            Tentar novamente
          </button>
        </div>
      </section>
    );
  const professional = detail.data;
  const unitName =
    units.data?.units.find((unit) => unit.publicId === professional.primaryUnitPublicId)?.name ??
    null;
  const formError =
    mutation.error instanceof Error ? 'Não foi possível salvar as alterações.' : null;
  return (
    <section className="professional-profile-page">
      <button
        className="profile-back"
        type="button"
        onClick={() => {
          void navigate('/app/equipe/profissionais');
        }}
      >
        ← Profissionais
      </button>
      <ProfileHeader
        professional={professional}
        unitName={unitName}
        tenantPublicId={tenantPublicId}
        onEdit={() => {
          changeTab('profile');
          setEditing('profile');
        }}
        onPhoto={(file) => {
          void uploadPhoto(file);
        }}
        onAgenda={() => {
          void navigate(`/app/agenda?professional=${professional.publicId}`);
        }}
      />
      <ProfileTabs value={tab} onChange={changeTab} />
      {savedMessage && (
        <p className="profile-save-success" role="status">
          Alterações salvas.
        </p>
      )}
      <div className="profile-tab-content">
        {tab === 'profile' &&
          (editing === 'profile' ? (
            <ProfessionalForm
              professional={professional}
              busy={mutation.isPending}
              error={formError}
              terminology={terminology}
              tenantPublicId={tenantPublicId}
              onSave={save}
              onCancel={() => {
                setEditing(null);
              }}
            />
          ) : (
            <>
              <ProfileOverview
                professional={professional}
                unitName={unitName}
                onEdit={() => {
                  setEditing('profile');
                }}
              />
              <ProfessionalUnitLinks
                tenantPublicId={tenantPublicId}
                professionalPublicId={professional.publicId}
              />
            </>
          ))}
        {tab === 'services' && (
          <ProfessionalServiceLinks
            tenantPublicId={tenantPublicId}
            professionalPublicId={professional.publicId}
          />
        )}
        {tab === 'schedule' && (
          <div className="profile-schedule-stack">
            <section className="profile-section availability-intro">
              <div>
                <p className="eyebrow">Disponibilidade</p>
                <h3>Jornada e pausas</h3>
                <p>
                  Configure quando o profissional atende. A operação diária continua na Agenda
                  principal.
                </p>
              </div>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  void navigate(`/app/agenda?professional=${professional.publicId}`);
                }}
              >
                Ver agenda de {professional.publicName.split(' ')[0]}
              </button>
            </section>
            <ProfessionalSchedule
              tenantPublicId={tenantPublicId}
              professionalPublicId={professional.publicId}
            />
            <ProfessionalUnavailability
              tenantPublicId={tenantPublicId}
              professionalPublicId={professional.publicId}
            />
          </div>
        )}
        {tab === 'commission' &&
          (editing === 'commission' ? (
            <ProfessionalForm
              professional={professional}
              busy={mutation.isPending}
              error={formError}
              terminology={terminology}
              tenantPublicId={tenantPublicId}
              onSave={save}
              onCancel={() => {
                setEditing(null);
              }}
              section="commission"
            />
          ) : (
            <CommissionOverview
              professional={professional}
              onEdit={() => {
                setEditing('commission');
              }}
            />
          ))}
        {tab === 'access' &&
          (editing === 'access' ? (
            <ProfessionalForm
              professional={professional}
              busy={mutation.isPending}
              error={formError}
              terminology={terminology}
              tenantPublicId={tenantPublicId}
              onSave={save}
              onCancel={() => {
                setEditing(null);
              }}
              section="access"
            />
          ) : (
            <AccessOverview
              professional={professional}
              tenantPublicId={tenantPublicId}
              onEdit={() => {
                setEditing('access');
              }}
            />
          ))}
      </div>
    </section>
  );
}
