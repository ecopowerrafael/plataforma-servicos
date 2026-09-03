import { BusinessUnitSchema, TenantUnitsResponseSchema, ProfessionalListResponseSchema, ProfessionalUnitsResponseSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { ErrorState, PageHeader } from './PlatformUi.js';

type Unit = z.infer<typeof BusinessUnitSchema>;
type Professional = z.infer<typeof ProfessionalListResponseSchema>['items'][0];

export function UnitsModule({ tenantPublicId }: { tenantPublicId: string }) {
  const queryClient = useQueryClient();
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['platform-units', tenantPublicId],
    queryFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/units`, {
        schema: TenantUnitsResponseSchema,
      }),
  });

  const setHeadquarters = useMutation({
    mutationFn: (unit: Unit) =>
      httpClient.request(
        `/platform/tenants/${tenantPublicId}/units/${unit.publicId}/set-headquarters`,
        { method: 'POST', schema: z.object({ unit: BusinessUnitSchema }) },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['platform-units', tenantPublicId],
      });
    },
  });

  const toggleActive = useMutation({
    mutationFn: (unit: Unit) =>
      httpClient.request(
        `/platform/tenants/${tenantPublicId}/units/${unit.publicId}/${
          unit.status === 'ACTIVE' ? 'deactivate' : 'activate'
        }`,
        { method: 'POST', schema: z.object({ unit: BusinessUnitSchema }) },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['platform-units', tenantPublicId],
      });
    },
  });

  if (isLoading)
    return (
      <article className="platform-panel">
        <p style={{ margin: 0, textAlign: 'center', color: '#99958f' }}>Carregando...</p>
      </article>
    );

  if (error instanceof Error) return <ErrorState error={error.message} />;
  if (!data) return <p>Nenhum dado disponível.</p>;

  return (
    <section>
      <PageHeader
        title="Unidades"
        description="Gerencie as unidades de negócio do estabelecimento"
        action={
          <button className="action-button primary" onClick={() => setCreateModalOpen(true)}>
            + Nova unidade
          </button>
        }
      />

      {data.units.length === 0 ? (
        <article className="platform-panel">
          <p style={{ textAlign: 'center', color: '#57534e' }}>Nenhuma unidade encontrada.</p>
        </article>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {data.units.map((unit) => (
            <article
              key={unit.publicId}
              className="platform-panel"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                gap: '1rem',
                alignItems: 'start',
              }}
            >
              <div>
                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem' }}>{unit.name}</h3>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#57534e' }}>
                  {unit.city && `${unit.city}, ${unit.state ?? ''}`}
                  {unit.city && unit.isHeadquarters && ' · '}
                  {unit.isHeadquarters && <strong>Matriz</strong>}
                </p>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '6px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    backgroundColor: unit.status === 'ACTIVE' ? '#f0fdf4' : '#fff1f2',
                    color: unit.status === 'ACTIVE' ? '#047857' : '#b91c1c',
                    border: `1px solid ${unit.status === 'ACTIVE' ? '#bbf7d0' : '#fecdd3'}`,
                  }}
                >
                  {unit.status === 'ACTIVE' ? 'Ativa' : 'Inativa'}
                </span>

                <ProfessionalsSection tenantPublicId={tenantPublicId} unitPublicId={unit.publicId} />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
                {!unit.isHeadquarters && (
                  <button
                    onClick={() => setHeadquarters.mutate(unit)}
                    disabled={setHeadquarters.isPending}
                    className="action-button secondary"
                    style={{ fontSize: '0.75rem', padding: '0.4rem 0.6rem' }}
                  >
                    {setHeadquarters.isPending ? 'Salvando...' : 'Definir como matriz'}
                  </button>
                )}
                <button
                  onClick={() => toggleActive.mutate(unit)}
                  disabled={toggleActive.isPending}
                  className={unit.status === 'ACTIVE' ? 'action-button danger' : 'action-button primary'}
                  style={{ fontSize: '0.75rem', padding: '0.4rem 0.6rem' }}
                >
                  {unit.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {createModalOpen && (
        <CreateUnitModal
          tenantPublicId={tenantPublicId}
          onClose={() => setCreateModalOpen(false)}
          onUnitCreated={() => {
            setCreateModalOpen(false);
            queryClient.invalidateQueries({
              queryKey: ['platform-units', tenantPublicId],
            });
          }}
        />
      )}
    </section>
  );
}

function ProfessionalsSection({ tenantPublicId, unitPublicId }: { tenantPublicId: string; unitPublicId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);

  const { data: linkedProfessionals, refetch: refetchLinked } = useQuery({
    queryKey: ['unit-professionals', tenantPublicId, unitPublicId],
    queryFn: () =>
      expanded
        ? httpClient.request(
            `/platform/tenants/${tenantPublicId}/units/${unitPublicId}/professionals`,
            { schema: ProfessionalUnitsResponseSchema },
          )
        : Promise.resolve({ items: [] }),
    enabled: expanded,
  });

  const { data: availableProfessionals } = useQuery({
    queryKey: ['all-professionals', tenantPublicId],
    queryFn: () =>
      linkModalOpen
        ? httpClient.request(`/platform/tenants/${tenantPublicId}/professionals`, {
            schema: ProfessionalListResponseSchema,
          })
        : Promise.resolve({ items: [] }),
    enabled: linkModalOpen,
  });

  const linkMutation = useMutation({
    mutationFn: (professional: Professional) =>
      httpClient.request(
        `/platform/tenants/${tenantPublicId}/units/${unitPublicId}/professionals/${professional.publicId}`,
        { method: 'POST', body: { active: true }, schema: z.object({ success: z.literal(true) }) },
      ),
    onSuccess: () => {
      setLinkModalOpen(false);
      refetchLinked();
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (professionalPublicId: string) =>
      httpClient.request(
        `/platform/tenants/${tenantPublicId}/units/${unitPublicId}/professionals/${professionalPublicId}`,
        { method: 'DELETE', schema: z.object({ success: z.literal(true) }) },
      ),
    onSuccess: () => {
      refetchLinked();
    },
  });

  return (
    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e0db' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          fontSize: '0.85rem',
          fontWeight: 600,
          color: '#8b7355',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {expanded ? '▼' : '▶'} Profissionais desta unidade ({linkedProfessionals?.items.length ?? 0})
      </button>

      {expanded && (
        <div style={{ marginTop: '0.75rem', paddingLeft: '1.25rem' }}>
          {linkedProfessionals && linkedProfessionals.items.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
              {linkedProfessionals.items.map((link) => (
                <div
                  key={link.publicId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.5rem',
                    backgroundColor: '#fafaf8',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                  }}
                >
                  <span>{link.professionalPublicId}</span>
                  <button
                    onClick={() => unlinkMutation.mutate(link.professionalPublicId)}
                    disabled={unlinkMutation.isPending}
                    className="action-button danger"
                    style={{ fontSize: '0.7rem', padding: '0.3rem 0.5rem' }}
                  >
                    {unlinkMutation.isPending ? '...' : 'Desvincular'}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '0.8rem', color: '#9f9992', margin: '0 0 0.75rem 0' }}>Nenhum profissional vinculado.</p>
          )}

          <button
            onClick={() => setLinkModalOpen(true)}
            className="action-button primary"
            style={{ fontSize: '0.75rem', padding: '0.4rem 0.6rem' }}
          >
            + Vincular profissional
          </button>

          {linkModalOpen && (
            <LinkProfessionalModal
              available={availableProfessionals?.items ?? []}
              linked={linkedProfessionals?.items ?? []}
              isLoading={linkMutation.isPending}
              onSelect={(professional) => linkMutation.mutate(professional)}
              onClose={() => setLinkModalOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function LinkProfessionalModal({
  available,
  linked,
  isLoading,
  onSelect,
  onClose,
}: {
  available: Professional[];
  linked: Array<{ professionalPublicId: string }>;
  isLoading: boolean;
  onSelect: (professional: Professional) => void;
  onClose: () => void;
}) {
  const linkedIds = new Set(linked.map((l) => l.professionalPublicId));
  const notLinked = available.filter((p) => !linkedIds.has(p.publicId));

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <article
        className="platform-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '90%',
          maxWidth: '400px',
          maxHeight: '70vh',
          overflow: 'auto',
        }}
      >
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem' }}>Vincular profissional</h3>

        {notLinked.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: '#9f9992', textAlign: 'center' }}>Todos os profissionais já estão vinculados.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            {notLinked.map((professional) => (
              <button
                key={professional.publicId}
                onClick={() => onSelect(professional)}
                disabled={isLoading}
                style={{
                  padding: '0.75rem',
                  textAlign: 'left',
                  border: '1px solid #e5e0db',
                  borderRadius: '6px',
                  backgroundColor: '#fafaf8',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                }}
              >
                {professional.name || professional.publicName || professional.publicId}
              </button>
            ))}
          </div>
        )}

        <button onClick={onClose} className="action-button secondary" style={{ width: '100%' }}>
          Fechar
        </button>
      </article>
    </div>
  );
}

function CreateUnitModal({
  tenantPublicId,
  onClose,
  onUnitCreated,
}: {
  tenantPublicId: string;
  onClose: () => void;
  onUnitCreated: () => void;
}) {
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    city: '',
    state: '',
  });

  const createMutation = useMutation({
    mutationFn: () =>
      httpClient.request(`/platform/tenants/${tenantPublicId}/units`, {
        method: 'POST',
        body: formData,
        schema: z.object({ unit: BusinessUnitSchema }),
      }),
    onSuccess: () => {
      onUnitCreated();
    },
  });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <article
        className="platform-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '90%',
          maxWidth: '500px',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
      >
        <h2 style={{ margin: '0 0 1.5rem 0', fontSize: '1.125rem' }}>Nova unidade</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>Nome *</span>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Unidade Centro"
              style={{ padding: '0.65rem 0.85rem', border: '1px solid #ede8e1', borderRadius: '10px', fontSize: '0.88rem' }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>Slug *</span>
            <input
              type="text"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              placeholder="Ex: centro"
              style={{ padding: '0.65rem 0.85rem', border: '1px solid #ede8e1', borderRadius: '10px', fontSize: '0.88rem' }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>Cidade</span>
            <input
              type="text"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              placeholder="Ex: São Paulo"
              style={{ padding: '0.65rem 0.85rem', border: '1px solid #ede8e1', borderRadius: '10px', fontSize: '0.88rem' }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>Estado</span>
            <input
              type="text"
              value={formData.state}
              onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              placeholder="Ex: SP"
              style={{ padding: '0.65rem 0.85rem', border: '1px solid #ede8e1', borderRadius: '10px', fontSize: '0.88rem' }}
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !formData.name || !formData.slug}
            className="action-button primary"
            style={{ flex: 1 }}
          >
            {createMutation.isPending ? 'Criando...' : 'Criar'}
          </button>
          <button onClick={onClose} className="action-button secondary" style={{ flex: 1 }}>
            Cancelar
          </button>
        </div>
      </article>
    </div>
  );
}
