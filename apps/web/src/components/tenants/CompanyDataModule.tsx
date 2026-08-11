import {
  BusinessProfileCatalog,
  TenantIdentityResponseSchema,
  TenantSlugSchema,
  UpdateTenantIdentityRequestSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../../lib/http.js';
import { ConfirmationDialog, type ConfirmationRequest } from '../ConfirmationDialog.js';

const SlugAvailabilitySchema = z.object({ available: z.boolean() });
interface IdentityDraft {
  displayName: string;
  legalName: string;
  slug: string;
  profile: keyof typeof BusinessProfileCatalog;
  customType: string;
}
const normalizeSlug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 63);

export function CompanyDataModule({ tenantPublicId }: { tenantPublicId: string }) {
  const client = useQueryClient();
  const queryKey = ['tenant', tenantPublicId, 'identity'];
  const identity = useQuery({
    queryKey,
    queryFn: () =>
      httpClient.request('/tenant/identity', {
        schema: TenantIdentityResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const [draft, setDraft] = useState<IdentityDraft | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const persisted = identity.data?.identity;
  const values: IdentityDraft = draft ?? {
    displayName: persisted?.displayName ?? '',
    legalName: persisted?.legalName ?? '',
    slug: persisted?.slug ?? '',
    profile: persisted?.businessProfile ?? 'GENERIC',
    customType: persisted?.businessTypeCustom ?? '',
  };
  const { displayName, legalName, slug, profile, customType } = values;
  const publicAddress = `${window.location.origin}/public/${slug || 'seu-negocio'}`;
  const parsedSlug = useMemo(() => TenantSlugSchema.safeParse(slug), [slug]);
  const slugChanged = persisted !== undefined && slug !== persisted.slug;
  const slugChangeAvailable = persisted?.slugChangeAvailable ?? false;
  const availability = useQuery({
    queryKey: ['tenant', tenantPublicId, 'identity', 'slug', slug],
    queryFn: () =>
      httpClient.request(`/tenant/onboarding/slug-availability?slug=${encodeURIComponent(slug)}`, {
        schema: SlugAvailabilitySchema,
        tenantPublicId,
      }),
    enabled: slugChanged && parsedSlug.success && slugChangeAvailable,
    retry: false,
  });
  const save = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/identity', {
        method: 'PATCH',
        tenantPublicId,
        body: UpdateTenantIdentityRequestSchema.parse({
          displayName,
          legalName,
          businessProfile: profile,
          businessTypeCustom: profile === 'GENERIC' ? customType.trim() || null : null,
          ...(slugChanged ? { slug } : {}),
        }),
        schema: TenantIdentityResponseSchema,
      }),
    onSuccess: async () => {
      setDraft(null);
      setNotice('Dados da empresa atualizados.');
      await Promise.all([
        client.invalidateQueries({ queryKey }),
        client.invalidateQueries({ queryKey: ['auth', 'me'] }),
      ]);
    },
  });
  if (identity.isPending)
    return (
      <section className="module-loading" aria-busy="true">
        Carregando dados da empresa…
      </section>
    );
  if (identity.error instanceof Error || identity.data === undefined)
    return (
      <section className="area-error-state">
        <h2>Não foi possível carregar os dados da empresa.</h2>
        <button
          type="button"
          onClick={() => {
            void identity.refetch();
          }}
        >
          Tentar novamente
        </button>
      </section>
    );
  const slugReady =
    !slugChanged ||
    (identity.data.identity.slugChangeAvailable &&
      parsedSlug.success &&
      availability.data?.available === true);
  const doSave = () => {
    save.mutate();
  };
  return (
    <section className="company-data-page" aria-labelledby="company-data-title">
      <div className="module-header">
        <div>
          <p className="eyebrow">Minha empresa</p>
          <h2 id="company-data-title">Dados da empresa</h2>
          <p>As informações que identificam seu negócio para clientes e equipe.</p>
        </div>
      </div>
      {notice === null ? null : <p className="success-message">{notice}</p>}
      {save.error instanceof Error ? <p className="form-error">{save.error.message}</p> : null}
      <div className="company-data-grid">
        <form
          className="company-data-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (slugChanged) {
              setConfirmation({
                title: 'Confirmar novo endereço?',
                description:
                  'Escolha com atenção. Por segurança e consistência dos seus links, o endereço poderá ser alterado somente uma vez.',
                confirmLabel: 'Confirmar e salvar',
                requiresReason: false,
                variant: 'default',
                onConfirm: async () => {
                  await save.mutateAsync();
                },
              });
            } else doSave();
          }}
        >
          <section className="brand-settings-card">
            <h3>Tipo de negócio</h3>
            <p>Escolha a opção que melhor representa seu estabelecimento.</p>
            <label>
              Tipo
              <select
                className="control-lg"
                value={profile}
                onChange={(event) => {
                  setDraft({
                    ...values,
                    profile: event.target.value as keyof typeof BusinessProfileCatalog,
                  });
                }}
              >
                {Object.values(BusinessProfileCatalog).map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.publicName}
                  </option>
                ))}
              </select>
            </label>
            {profile === 'GENERIC' ? (
              <label>
                Como você descreve seu negócio?
                <input
                  className="control-lg"
                  value={customType}
                  onChange={(event) => {
                    setDraft({ ...values, customType: event.target.value });
                  }}
                  placeholder="Ex.: Clínica veterinária"
                />
              </label>
            ) : null}
          </section>
          <section className="brand-settings-card">
            <h3>Nome público do estabelecimento</h3>
            <p>Este é o nome que seus clientes verão no seu aplicativo e página de agendamento.</p>
            <label>
              Nome público
              <input
                className="control-lg"
                value={displayName}
                maxLength={120}
                onChange={(event) => {
                  setDraft({ ...values, displayName: event.target.value });
                }}
              />
            </label>
            <label>
              Razão social / nome legal
              <input
                className="control-lg"
                value={legalName}
                maxLength={160}
                onChange={(event) => {
                  setDraft({ ...values, legalName: event.target.value });
                }}
              />
            </label>
          </section>
          <section className="brand-settings-card">
            <h3>Endereço do seu aplicativo</h3>
            <p>
              Seu endereço público será exibido como{' '}
              <strong>{publicAddress}</strong>.
            </p>
            <label>
              Endereço
              <input
                className="control-lg"
                value={slug}
                disabled={!identity.data.identity.slugChangeAvailable}
                onChange={(event) => {
                  setDraft({ ...values, slug: normalizeSlug(event.target.value) });
                }}
              />
            </label>
            {identity.data.identity.slugChangeAvailable ? (
              <small>
                {!slugChanged
                  ? 'Você ainda pode alterar este endereço uma vez.'
                  : !parsedSlug.success
                    ? parsedSlug.error.issues[0]?.message
                    : availability.isPending
                      ? 'Verificando disponibilidade…'
                      : availability.data?.available
                        ? 'Endereço disponível.'
                        : 'Este endereço já está em uso.'}
              </small>
            ) : (
              <small>Este endereço já utilizou a alteração permitida e está protegido.</small>
            )}
          </section>
          <div className="brand-action-bar">
            <span>
              {slugChanged
                ? 'O novo endereço será permanente após salvar.'
                : 'Revise os dados antes de salvar.'}
            </span>
            <button
              className="primary-button"
              disabled={
                save.isPending ||
                displayName.trim().length < 2 ||
                legalName.trim().length < 2 ||
                !slugReady
              }
              type="submit"
            >
              {save.isPending ? 'Salvando…' : 'Salvar dados'}
            </button>
          </div>
        </form>
        <aside className="company-name-preview">
          <span>Prévia no aplicativo</span>
          <div>
            <i>{displayName.trim().slice(0, 1).toUpperCase() || 'A'}</i>
            <strong>{displayName || 'Seu estabelecimento'}</strong>
            <small>{BusinessProfileCatalog[profile].publicName}</small>
          </div>
          <code>{publicAddress}</code>
        </aside>
      </div>
      {confirmation === null ? null : (
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
