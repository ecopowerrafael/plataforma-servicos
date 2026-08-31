import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { httpClient } from '../lib/http.js';

const Categories = z.object({ categories: z.array(z.object({ slug: z.string(), pluralName: z.string(), icon: z.string().nullable(), _count: z.object({ businesses: z.number() }) })) });
const Cities = z.object({ category: z.object({ slug: z.string() }), cities: z.array(z.object({ city: z.string(), state: z.string(), citySlug: z.string() })) });
const Result = z.object({ source: z.enum(['DIRECTORY', 'GEOAPIFY']), publicId: z.string().nullable(), name: z.string(), address: z.string(), city: z.string(), state: z.string(), neighborhood: z.string().nullable(), phone: z.string().nullable(), whatsapp: z.string().nullable(), website: z.string().nullable(), latitude: z.number().nullable(), longitude: z.number().nullable(), distanceMeters: z.number().nullable() });
const Search = z.object({ location: z.object({ cep: z.string(), city: z.string(), state: z.string(), neighborhood: z.string().nullable(), street: z.string().nullable(), latitude: z.number().nullable(), longitude: z.number().nullable() }), results: z.array(Result), cityUrl: z.string() });
function cepMask(value: string) { const digits = value.replace(/\D/gu, '').slice(0, 8); return digits.length <= 5 ? digits : `${digits.slice(0, 5)}-${digits.slice(5)}`; }

export function FindServiceModal({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<string>();
  const [cep, setCep] = useState('');
  const categories = useQuery({ queryKey: ['directory', 'categories'], queryFn: () => httpClient.request('/public/directory/categories', { schema: Categories }) });
  const cities = useQuery({ enabled: category !== undefined, queryKey: ['directory', 'cities', category], queryFn: () => httpClient.request(`/public/directory/categories/${category}/cities`, { schema: Cities }) });
  const search = useMutation({ mutationFn: () => httpClient.request(`/public/directory/location/by-cep/${cep.replace(/\D/gu, '')}?category=${encodeURIComponent(category ?? '')}`, { schema: Search }) });
  const trackWhatsapp = (publicId: string) => { void httpClient.request(`/public/directory/businesses/${publicId}/events`, { method: 'POST', body: { type: 'WHATSAPP_CLICK', visitorId: localStorage.getItem('agendei_directory_visitor') ?? crypto.randomUUID(), sessionId: sessionStorage.getItem('agendei_directory_session') ?? crypto.randomUUID(), sourcePath: window.location.pathname }, schema: z.object({ accepted: z.literal(true) }) }).catch(() => undefined); };
  const getFallbackUrl = () => {
    if (!search.data || !category) return undefined;
    const cityExists = cities.data?.cities.some((c) => c.city.toLowerCase() === search.data.location.city.toLowerCase() && c.state === search.data.location.state) ?? false;
    return cityExists ? search.data.cityUrl : `/encontre/${category}`;
  };
  const fallbackUrl = getFallbackUrl();
  const fallbackText = search.data && category ? (fallbackUrl === `/encontre/${category}` ? `Ver outras ${categories.data?.categories.find((c) => c.slug === category)?.pluralName.toLowerCase() ?? 'opções'}` : `Ver todos em ${search.data.location.city}`) : '';
  return <div className="find-modal-backdrop" role="presentation" onMouseDown={onClose}><section className="find-modal" role="dialog" aria-modal="true" aria-labelledby="find-title" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="find-modal-close" onClick={onClose} aria-label="Fechar">×</button><h2 id="find-title">Encontre um serviço</h2><p>Escolha o serviço e informe seu CEP para encontrar opções próximas.</p><label>Categoria<select value={category ?? ''} onChange={(event) => { setCategory(event.target.value || undefined); search.reset(); }}><option value="">Selecione uma categoria</option>{categories.data?.categories.map((item) => <option key={item.slug} value={item.slug}>{item.icon ?? '•'} {item.pluralName}</option>)}</select></label><label>CEP<input inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" value={cep} onChange={(event) => setCep(cepMask(event.target.value))} /></label><button className="marketing-button" type="button" disabled={category === undefined || cep.replace(/\D/gu, '').length !== 8 || search.isPending} onClick={() => search.mutate()}>Encontrar perto de mim</button>{search.error instanceof Error ? <p role="alert">{search.error.message}</p> : null}{search.data ? <section aria-live="polite"><p><strong>CEP {cepMask(search.data.location.cep)}</strong><br />{search.data.location.city} - {search.data.location.state}</p><h3>Estabelecimentos próximos</h3>{search.data.results.length === 0 ? <p>Não encontramos estabelecimentos cadastrados nesta região. Tente outro CEP ou aumente a região de busca.</p> : <ul>{search.data.results.map((item, index) => <li key={`${item.source}-${item.publicId ?? item.name}-${index}`}><strong>{item.name}</strong><br /><small>{item.address || `${item.city}/${item.state}`}</small>{item.source === 'DIRECTORY' && item.whatsapp ? <p><a href={`https://wa.me/${item.whatsapp}`} target="_blank" rel="noreferrer" onClick={() => { if (item.publicId !== null) trackWhatsapp(item.publicId); }}>Agendar pelo WhatsApp</a></p> : item.phone ? <p>{item.phone}</p> : null}</li>)}</ul>}{fallbackUrl && <a className="marketing-button" href={fallbackUrl}>{fallbackText}</a>}</section> : null}</section></div>;
}
