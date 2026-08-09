import { CustomerFavoriteListResponseSchema, SuccessResponseSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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

  return (
    <section className="platform-form" aria-label="Meus favoritos">
      <h4>Meus favoritos</h4>
      {favorites.isPending ? <p>Carregando favoritos…</p> : null}
      {favorites.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar os favoritos.</p>
      ) : null}
      {errorMessage !== null && (
        <p className="form-error" role="alert">
          {errorMessage}
        </p>
      )}
      <div>
        <strong>{'Profissionais'}</strong>
        <ul>
          {professionals.map((professional) => {
            const isFavorite = favoriteProfessionalIds.has(professional.publicId);
            return (
              <li key={professional.publicId}>
                <span>{professional.name}</span>
                <button
                  disabled={busy}
                  type="button"
                  onClick={() => {
                    if (isFavorite) {
                      const favoriteId = findFavoriteId('professional', professional.publicId);
                      if (favoriteId !== undefined) remove.mutate(favoriteId);
                    } else {
                      add.mutate({ professionalPublicId: professional.publicId });
                    }
                  }}
                >
                  {isFavorite ? 'Remover dos favoritos' : 'Favoritar'}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <strong>{'Serviços'}</strong>
        <ul>
          {services.map((service) => {
            const isFavorite = favoriteServiceIds.has(service.publicId);
            return (
              <li key={service.publicId}>
                <span>{service.name}</span>
                <button
                  disabled={busy}
                  type="button"
                  onClick={() => {
                    if (isFavorite) {
                      const favoriteId = findFavoriteId('service', service.publicId);
                      if (favoriteId !== undefined) remove.mutate(favoriteId);
                    } else {
                      add.mutate({ servicePublicId: service.publicId });
                    }
                  }}
                >
                  {isFavorite ? 'Remover dos favoritos' : 'Favoritar'}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
