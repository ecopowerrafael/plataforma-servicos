import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { httpClient } from '../../lib/http.js';
import { ProspectingFlowEditPage } from './ProspectingFlowEditPage.js';

const itemSchema = z.object({ publicId: z.string().uuid(), purpose: z.string(), name: z.string(), isActive: z.boolean() });
export function ProspectingAttendantView() {
  const { data, isLoading, error } = useQuery({ queryKey: ['prospecting-attendant-flow'], queryFn: () => httpClient.request('/platform/prospecting/flows?purpose=ATTENDANT', { schema: z.object({ items: z.array(itemSchema) }) }) });
  const flow = data?.items[0];
  if (isLoading) return <div>Carregando Atendente Agendei...</div>;
  if (error || !flow) return <div>Fluxo do Atendente Agendei não configurado.</div>;
  return <ProspectingFlowEditPage flowId={flow.publicId} onBack={() => undefined} />;
}
