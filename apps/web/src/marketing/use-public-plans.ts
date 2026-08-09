import { PublicCommercialPlansResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';

import { httpClient } from '../lib/http.js';

export function usePublicPlans() {
  return useQuery({
    queryKey: ['public', 'commercial-plans'],
    queryFn: () =>
      httpClient.request('/public/commercial-plans', {
        schema: PublicCommercialPlansResponseSchema,
      }),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
