import { AppointmentReviewListResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';

import { httpClient } from '../lib/http.js';

export function CustomerReviews({ slug }: { slug: string }) {
  const reviews = useQuery({
    queryKey: ['public', slug, 'customer', 'reviews'],
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/reviews`, {
        schema: AppointmentReviewListResponseSchema,
      }),
    retry: false,
  });

  return (
    <section className="platform-form" aria-label="Minhas avaliações">
      <h4>Minhas avaliações</h4>
      {reviews.isPending ? <p>Carregando avaliações…</p> : null}
      {reviews.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar as avaliações.</p>
      ) : null}
      {reviews.data?.items.length === 0 ? <p>Nenhuma avaliação registrada.</p> : null}
      <ul>
        {reviews.data?.items.map((review) => (
          <li key={review.publicId}>
            <strong>{review.appointmentProtocol}</strong>
            <span>{`${review.serviceName} com ${review.professionalName}`}</span>
            <span>{`Nota: ${String(review.rating)}/5`}</span>
            {review.comment !== null && <span>{review.comment}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
