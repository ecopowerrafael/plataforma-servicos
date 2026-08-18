import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { httpClient } from '../lib/http.js';

const Categories = z.object({ categories: z.array(z.object({ slug: z.string(), pluralName: z.string(), icon: z.string().nullable(), _count: z.object({ businesses: z.number() }) })) });
const Cities = z.object({ cities: z.array(z.object({ city: z.string(), state: z.string(), citySlug: z.string(), count: z.number() })) });

export function FindServiceModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate(); const [category, setCategory] = useState<string>(); const [city, setCity] = useState<string>();
  const categories = useQuery({ queryKey: ['directory', 'categories'], queryFn: () => httpClient.request('/public/directory/categories', { schema: Categories }) });
  const cities = useQuery({ enabled: category !== undefined, queryKey: ['directory', 'cities', category], queryFn: () => httpClient.request(`/public/directory/categories/${category ?? ''}/cities`, { schema: Cities }) });
  return <div className="find-modal-backdrop" role="presentation" onMouseDown={onClose}><section className="find-modal" role="dialog" aria-modal="true" aria-labelledby="find-title" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="find-modal-close" onClick={onClose} aria-label="Fechar">×</button><h2 id="find-title">Encontre um serviço</h2><p>Escolha o que procura e a cidade para ver estabelecimentos.</p><label>O que você procura?<select value={category ?? ''} onChange={(event) => { setCategory(event.target.value || undefined); setCity(undefined); }}><option value="">Selecione uma categoria</option>{categories.data?.categories.map((item) => <option key={item.slug} value={item.slug}>{item.icon ?? '•'} {item.pluralName}</option>)}</select></label><label>Cidade<select disabled={category === undefined || cities.isPending} value={city ?? ''} onChange={(event) => setCity(event.target.value || undefined)}><option value="">Selecione uma cidade</option>{cities.data?.cities.map((item) => <option key={item.citySlug} value={item.citySlug}>{item.city}, {item.state} ({item.count})</option>)}</select></label><button className="marketing-button" type="button" disabled={category === undefined || city === undefined} onClick={() => { if (category !== undefined && city !== undefined) { onClose(); void navigate(`/encontre/${category}/${city}`); } }}>Encontrar</button></section></div>;
}
