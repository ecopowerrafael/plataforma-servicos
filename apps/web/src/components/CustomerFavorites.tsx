import { CustomerFavoriteListResponseSchema, SuccessResponseSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient, HttpError } from '../lib/http.js';

interface FavoriteTarget {
  publicId: string;
  name: string;
}

interface CustomerFavoritesProps {
  slug: string;
  services: FavoriteTarget[];
  professionals: FavoriteTarget[];
}

export function CustomerFavorites({ slug, services, professionals }: CustomerFavoritesProps) {
  const [tab, setTab] = useState<'professional' | 'service'>('professional');
  const queryClient = useQueryClient();
  const queryKey = ['public', slug, 'customer', 'favorites'];

  const favorites = useQuery({
    queryKey,
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/favorites`, {
        schema: CustomerFavoriteListResponseSchema,
      }),
    retry: false,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const add = useMutation({
    mutationFn: (body: { professionalPublicId?: string; servicePublicId?: string }) =>
      httpClient.request(`/public/sites/${slug}/customer/favorites`, {
        method: 'POST',
        body,
        schema: CustomerFavoriteListResponseSchema.shape.items.element,
      }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (publicId: string) =>
      httpClient.request(`/public/sites/${slug}/customer/favorites/${publicId}`, {
        method: 'DELETE',
        schema: SuccessResponseSchema,
      }),
    onSuccess: invalidate,
  });

  const favoriteProfessionalIds = new Set(
    favorites.data?.items
      .map((item) => item.professionalPublicId)
      .filter((id): id is string => id !== null) ?? [],
  );
  const favoriteServiceIds = new Set(
    favorites.data?.items
      .map((item) => item.servicePublicId)
      .filter((id): id is string => id !== null) ?? [],
  );

  const busy = add.isPending || remove.isPending;
  const mutationError = add.error ?? remove.error;
  const errorMessage =
    mutationError instanceof HttpError
      ? mutationError.message
      : mutationError instanceof Error
        ? mutationError.message
        : null;

  const findFavoriteId = (kind: 'professional' | 'service', publicId: string) =>
    favorites.data?.items.find((item) =>
      kind === 'professional'
        ? item.professionalPublicId === publicId
        : item.servicePublicId === publicId,
    )?.publicId;

  const renderGroup = (
    title: string,
    items: FavoriteTarget[],
    kind: 'professional' | 'service',
    favoriteIds: Set<string>,
  ) => (
    <section className="customer-card" aria-label={title}>
      <header>
        <strong>{title}</strong>
      </header>
      {items.length === 0 ? (
        <p className="customer-empty">Nada disponível por aqui ainda.</p>
      ) : (
        <div className="customer-favorite-list">
          {items.map((item) => {
            const isFavorite = favoriteIds.has(item.publicId);
            return (
              <article
                className={`customer-favorite${isFavorite ? ' is-favorite' : ''}`}
                key={item.publicId}
              >
                <span>{item.name}</span>
                <button
                  className={isFavorite ? 'public-link-button' : 'public-secondary-button'}
                  disabled={busy}
                  type="button"
                  aria-pressed={isFavorite}
                  onClick={() => {
                    if (isFavorite) {
                      const favoriteId = findFavoriteId(kind, item.publicId);
                      if (favoriteId !== undefined) remove.mutate(favoriteId);
                    } else {
                      add.mutate(
                        kind === 'professional'
                          ? { professionalPublicId: item.publicId }
                          : { servicePublicId: item.publicId },
                      );
                    }
                  }}
                >
                  {isFavorite ? 'Remover' : 'Favoritar'}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );

  return (
    <section className="customer-section" aria-label="Meus favoritos">
      <div className="customer-tabs" role="tablist">
        <button aria-selected={tab === 'professional'} onClick={() => { setTab('professional'); }} role="tab" type="button">Profissionais</button>
        <button aria-selected={tab === 'service'} onClick={() => { setTab('service'); }} role="tab" type="button">Serviços</button>
      </div>
      {favorites.isPending ? (
        <div className="customer-skeleton-list" aria-busy="true">
          <span />
          <span />
        </div>
      ) : null}
      {favorites.error instanceof Error ? (
        <p className="public-form-error" role="alert">
          Não foi possível carregar os favoritos.
        </p>
      ) : null}
      {errorMessage === null ? null : (
        <p className="public-form-error" role="alert">
          {errorMessage}
        </p>
      )}
      {tab === 'professional'
        ? renderGroup('Profissionais', professionals, 'professional', favoriteProfessionalIds)
        : renderGroup('Serviços', services, 'service', favoriteServiceIds)}
    </section>
  );
}
