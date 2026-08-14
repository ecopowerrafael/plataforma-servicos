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
    <section className="customer-section" aria-label="Minhas avaliações">
      {reviews.isPending ? (
        <div className="customer-skeleton-list" aria-busy="true">
          <span />
          <span />
        </div>
      ) : null}
      {reviews.error instanceof Error ? (
        <p className="public-form-error" role="alert">
          Não foi possível carregar as avaliações.
        </p>
      ) : null}
      {reviews.data?.items.length === 0 ? (
        <p className="customer-empty">Nenhuma avaliação registrada.</p>
      ) : null}
      <div className="customer-review-list">
        {reviews.data?.items.map((review) => (
          <article className="customer-review" key={review.publicId}>
            <header>
              <strong>{review.serviceName}</strong>
              <span className="customer-rating" aria-label={`Nota ${String(review.rating)} de 5`}>
                {'★'.repeat(review.rating)}
                <small>{`${String(review.rating)}/5`}</small>
              </span>
            </header>
            <small>{review.professionalName}</small>
            {review.comment === null ? null : <p>{review.comment}</p>}
            <small className="customer-appointment-protocol">{review.appointmentProtocol}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
