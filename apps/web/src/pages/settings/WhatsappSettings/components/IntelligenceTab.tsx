import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { httpClient } from '../../../../lib/http.js';

const schema = z.object({
  services: z.array(z.object({ publicId: z.string(), name: z.string() })),
  combos: z.array(z.object({ publicId: z.string(), name: z.string() })),
  professionals: z.array(z.object({ publicId: z.string(), name: z.string() })),
  aliases: z.array(z.object({ publicId: z.string(), entityType: z.string(), entityPublicId: z.string(), alias: z.string() })),
});

export function IntelligenceTab({ tenantPublicId, canManage }: { tenantPublicId: string; canManage: boolean }) {
  const client = useQueryClient();
  const queryKey = ['tenant', tenantPublicId, 'whatsapp-intelligence'];
  const query = useQuery({ queryKey, queryFn: () => httpClient.request('/tenant/integrations/whatsapp/assistant-config/intelligence', { schema, tenantPublicId }) });
  const [selected, setSelected] = useState('');
  const [alias, setAlias] = useState('');
  const add = useMutation({ mutationFn: () => { const [entityType, entityPublicId] = selected.split(':'); return httpClient.request('/tenant/integrations/whatsapp/assistant-config/intelligence/aliases', { method: 'POST', body: { entityType, entityPublicId, alias }, tenantPublicId }); }, onSuccess: async () => { setAlias(''); await client.invalidateQueries({ queryKey }); } });
  const remove = useMutation({ mutationFn: (publicId: string) => httpClient.request(`/tenant/integrations/whatsapp/assistant-config/intelligence/aliases/${publicId}`, { method: 'DELETE', tenantPublicId }), onSuccess: () => client.invalidateQueries({ queryKey }) });
  if (query.isPending) return <section className="wa-card">Carregando vocabulário…</section>;
  if (query.isError || query.data === undefined) return <section className="wa-card">Não foi possível carregar o vocabulário do tenant.</section>;
  const entities = [...query.data.services.map((item) => ({ ...item, type: 'SERVICE', label: `Serviço · ${item.name}` })), ...query.data.combos.map((item) => ({ ...item, type: 'COMBO', label: `Combo · ${item.name}` })), ...query.data.professionals.map((item) => ({ ...item, type: 'PROFESSIONAL', label: `Profissional · ${item.name}` }))];
  return <section className="wa-card"><div className="wa-section-heading"><div><span className="wa-kicker">VOCABULÁRIO DO TENANT</span><h2>Inteligência</h2><p>Cadastre nomes alternativos usados pelos seus clientes. Eles valem somente para este estabelecimento.</p></div></div><div style={{ display: 'grid', gap: 8 }}><select value={selected} disabled={!canManage} onChange={(event) => setSelected(event.target.value)}><option value="">Escolha um serviço, combo ou profissional</option>{entities.map((item) => <option key={`${item.type}:${item.publicId}`} value={`${item.type}:${item.publicId}`}>{item.label}</option>)}</select><input value={alias} disabled={!canManage || selected === ''} placeholder="Nome alternativo, por exemplo: corte" onChange={(event) => setAlias(event.target.value)} /><button type="button" disabled={!canManage || selected === '' || alias.trim() === '' || add.isPending} onClick={() => add.mutate()}>Adicionar alias</button></div><ul>{query.data.aliases.map((item) => <li key={item.publicId}>{item.alias} <small>({item.entityType})</small>{canManage && <button type="button" onClick={() => remove.mutate(item.publicId)}>Remover</button>}</li>)}</ul></section>;
}
