import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { z } from 'zod';

import { MarketingShell } from '../marketing/MarketingShell.js';
import { marketingSiteUrl, usePageMetadata } from '../marketing/use-page-metadata.js';
import { httpClient } from '../lib/http.js';

const Category = z.object({ slug: z.string(), singularName: z.string(), pluralName: z.string(), description: z.string().nullable(), _count: z.object({ businesses: z.number() }).optional() });
const Categories = z.object({ categories: z.array(Category) });
const Cities = z.object({ category: Category, cities: z.array(z.object({ city: z.string(), state: z.string(), citySlug: z.string(), count: z.number() })) });
const Business = z.object({ publicId: z.string(), name: z.string(), slug: z.string(), citySlug: z.string(), rawAddress: z.string(), neighborhood: z.string().nullable(), city: z.string(), state: z.string(), postalCode: z.string().nullable(), phone: z.string().nullable(), whatsapp: z.string().nullable(), imageUrl: z.string().nullable(), tenantId: z.string().nullable(), category: Category.optional() });
const CityBusinesses = z.object({ category: Category, total: z.number(), page: z.number(), totalPages: z.number(), stats: z.object({ whatsappCount: z.number(), neighborhoods: z.array(z.object({ name: z.string(), count: z.number() })) }), items: z.array(Business) });

function telemetryIdentity() { const visitorKey = 'agendei_directory_visitor'; const sessionKey = 'agendei_directory_session'; let visitorId = localStorage.getItem(visitorKey); if (visitorId === null) { visitorId = crypto.randomUUID(); localStorage.setItem(visitorKey, visitorId); } let sessionId = sessionStorage.getItem(sessionKey); if (sessionId === null) { sessionId = crypto.randomUUID(); sessionStorage.setItem(sessionKey, sessionId); } return { visitorId, sessionId }; }
function trackEvent(publicId: string, type: 'BUSINESS_VIEW' | 'WHATSAPP_CLICK') { try { const query = new URLSearchParams(window.location.search); const identity = telemetryIdentity(); void httpClient.request(`/public/directory/businesses/${publicId}/events`, { method: 'POST', body: { type, ...identity, sourcePath: `${window.location.pathname}${window.location.search}`, referrer: document.referrer || undefined, utmSource: query.get('utm_source') ?? undefined, utmMedium: query.get('utm_medium') ?? undefined, utmCampaign: query.get('utm_campaign') ?? undefined }, schema: z.object({ accepted: z.literal(true) }) }).catch(() => undefined); } catch { /* telemetria não bloqueia navegação */ } }

function WhatsApp({ business }: { business: z.infer<typeof Business> }) { if (business.whatsapp === null) return business.phone === null ? null : <span>{business.phone}</span>; const path = `/encontre/${business.category?.slug ?? ''}/${business.citySlug}/${business.slug}`; return <a className="marketing-button" target="_blank" rel="noreferrer" onClick={() => trackEvent(business.publicId, 'WHATSAPP_CLICK')} href={`https://wa.me/${business.whatsapp}?text=${encodeURIComponent(`Olá, vim do Agendei (${marketingSiteUrl}${path}) e gostaria de agendar um serviço.`)}`}>Agendar pelo WhatsApp</a>; }
function Card({ business }: { business: z.infer<typeof Business> }) { const category = business.category?.slug; return <article className="directory-card">{business.imageUrl ? <img src={business.imageUrl} alt="" /> : null}<h2><Link to={`/encontre/${category ?? ''}/${business.citySlug}/${business.slug}`}>{business.name}</Link></h2><p>{business.neighborhood ? `${business.neighborhood} · ` : ''}{business.city}/{business.state}</p><p>{business.rawAddress}</p><WhatsApp business={business} /></article>; }

export function DirectoryHomePage() { usePageMetadata({ title: 'Encontre serviços perto de você | Agendei', description: 'Encontre estabelecimentos de serviços e entre em contato para agendar.', path: '/encontre' }); const query = useQuery({ queryKey: ['directory', 'categories'], queryFn: () => httpClient.request('/public/directory/categories', { schema: Categories }) }); return <MarketingShell><section className="marketing-page-hero"><div className="marketing-container"><p className="marketing-kicker">ENCONTRE</p><h1>Encontre serviços perto de você</h1><p>Consulte estabelecimentos, endereço e contatos para solicitar seu agendamento.</p><div className="directory-grid">{query.data?.categories.map((category) => <Link className="directory-category-card" key={category.slug} to={`/encontre/${category.slug}`}><strong>{category.icon ?? '•'} {category.pluralName}</strong><span>{category._count?.businesses ?? 0} estabelecimentos</span></Link>)}</div></div></section></MarketingShell>; }
export function DirectoryCategoryPage() {
  const { categorySlug = '' } = useParams();
  const [cepInput, setCepInput] = useState('');
  const [cepError, setCepError] = useState('');
  const [cepLoading, setCepLoading] = useState(false);

  const query = useQuery({ queryKey: ['directory', 'cities', categorySlug], queryFn: () => httpClient.request(`/public/directory/categories/${categorySlug}/cities`, { schema: Cities }) });
  const category = query.data?.category;

  const singular = category?.singularName ?? 'estabelecimento';
  const plural = category?.pluralName ?? 'serviços';

  usePageMetadata({
    title: category ? `${singular} perto de mim: encontre opções próximas | Agendei` : 'Encontre serviços | Agendei',
    description: category ? `Encontre ${plural.toLowerCase()} perto de você, veja endereço, bairro, telefone e WhatsApp para entrar em contato.` : 'Veja as cidades disponíveis no diretório Agendei.',
    path: `/encontre/${categorySlug}`
  });

  const handleCepSearch = async () => {
    if (!cepInput.trim()) {
      setCepError('Digite um CEP válido');
      return;
    }
    setCepLoading(true);
    setCepError('');
    try {
      const result = await httpClient.request(`/public/directory/location/by-cep/${cepInput.replace('-', '')}?category=${categorySlug}`, {
        schema: z.object({ city: z.string(), state: z.string() })
      });
      window.location.href = `/encontre/${categorySlug}/${result.city.toLowerCase().replace(/\s+/g, '-')}-${result.state.toLowerCase()}`;
    } catch {
      setCepError('Não encontramos resultados para este CEP');
      setCepLoading(false);
    }
  };

  return <MarketingShell>
    <section className="marketing-section">
      <div className="marketing-container">
        <h1>Encontre {plural.toLowerCase()} perto de você</h1>
        {category ? <div className="cep-search">
          <input
            type="text"
            placeholder="Digite seu CEP"
            value={cepInput}
            onChange={(e) => { setCepInput(e.target.value.replace(/\D/g, '').slice(0, 8)); setCepError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleCepSearch()}
            disabled={cepLoading}
            maxLength={8}
          />
          <button onClick={handleCepSearch} disabled={cepLoading}>{cepLoading ? 'Buscando...' : 'Buscar'}</button>
          {cepError && <p className="error">{cepError}</p>}
        </div> : null}
        <div className="directory-grid">
          {query.data?.cities.map((city) => <Link className="directory-category-card" key={city.citySlug} to={`/encontre/${categorySlug}/${city.citySlug}`}>{plural} em {city.city}, {city.state}<span>{city.count} encontrados</span></Link>)}
        </div>
      </div>
    </section>
  </MarketingShell>;
}
export function DirectoryCityPage() {
  const { categorySlug = '', citySlug = '' } = useParams();
  const [search] = useSearchParams();
  const page = Number(search.get('page') ?? '1');
  const query = useQuery({ queryKey: ['directory', categorySlug, citySlug, page], queryFn: () => httpClient.request(`/public/directory/${categorySlug}/${citySlug}?page=${page}`, { schema: CityBusinesses }) });
  const data = query.data;
  const city = data?.items[0];

  usePageMetadata({
    title: data && city ? `${data.category.pluralName} em ${city.city}, ${city.state}: encontre uma opção perto de você | Agendei` : 'Diretório Agendei',
    description: data && city ? `Encontre ${data.category.pluralName.toLowerCase()} em ${city.city}, veja endereço, bairro, telefone e WhatsApp para contato.` : 'Consulte estabelecimentos no diretório Agendei.',
    path: `/encontre/${categorySlug}/${citySlug}${page > 1 ? `?page=${page}` : ''}`
  });

  const totalPages = data?.totalPages ?? 0;
  const paginationRange = Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => {
    if (totalPages <= 7) return true;
    if (p === 1 || p === totalPages) return true;
    if (p >= page - 1 && p <= page + 1) return true;
    return false;
  });

  return <MarketingShell>
    <section className="marketing-section">
      <div className="marketing-container">
        <h1>{data?.category.pluralName} em {city?.city ?? citySlug}</h1>
        <p>Encontre opções perto de você em {city?.city}. Consulte {data?.total ?? 0} estabelecimentos disponíveis.</p>
        {data && data.stats.neighborhoods.length >= 2 ? <section><h2>{data.category.pluralName} por bairro</h2><p>{data.stats.neighborhoods.map((neighborhood) => `${neighborhood.name} (${neighborhood.count})`).join(' · ')}</p></section> : null}
        <div className="directory-list">
          {data?.items.map((business) => <Card key={business.publicId} business={{ ...business, category: data.category }} />)}
        </div>
        {totalPages > 1 ? <nav className="directory-pagination" aria-label="Paginação">
          {paginationRange[0] > 1 && <span>...</span>}
          {paginationRange.map((p) => <Link key={p} to={`/encontre/${categorySlug}/${citySlug}?page=${p}`} aria-current={p === page}>{p}</Link>)}
          {paginationRange[paginationRange.length - 1] < totalPages && <span>...</span>}
        </nav> : null}
      </div>
    </section>
  </MarketingShell>;
}
export function DirectoryBusinessPage() {
  const { categorySlug = '', citySlug = '', businessSlug = '' } = useParams();
  const query = useQuery({ queryKey: ['directory', 'business', categorySlug, citySlug, businessSlug], queryFn: () => httpClient.request(`/public/directory/${categorySlug}/${citySlug}/${businessSlug}`, { schema: Business }) });
  const relatedQuery = useQuery({
    queryKey: ['directory', 'related', categorySlug, citySlug, businessSlug],
    enabled: !!query.data,
    queryFn: () => httpClient.request(`/public/directory/${categorySlug}/${citySlug}?limit=6&exclude=${businessSlug}`, {
      schema: z.object({ items: z.array(Business) })
    })
  });

  const business = query.data;
  useEffect(() => { if (business !== undefined) trackEvent(business.publicId, 'BUSINESS_VIEW'); }, [business?.publicId]);

  const contactsDescription = business ? `${business.name} em ${business.city}/${business.state}. Consulte endereço${business.whatsapp ? ', WhatsApp' : ''}${business.phone ? ', telefone' : ''} e informações para contato.` : 'Estabelecimento do diretório Agendei.';

  usePageMetadata({
    title: business ? `${business.name} em ${business.city}, ${business.state} | Agendei` : 'Estabelecimento | Agendei',
    description: contactsDescription,
    path: `/encontre/${categorySlug}/${citySlug}/${businessSlug}`,
    structuredData: business ? [{
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: business.name,
      url: `${marketingSiteUrl}/encontre/${categorySlug}/${citySlug}/${businessSlug}`,
      ...(business.phone ? { telephone: business.phone } : {}),
      ...(business.imageUrl ? { image: business.imageUrl } : {}),
      address: {
        '@type': 'PostalAddress',
        streetAddress: business.rawAddress,
        addressLocality: business.city,
        addressRegion: business.state,
        ...(business.postalCode ? { postalCode: business.postalCode } : {}),
        addressCountry: 'BR'
      }
    }, {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Agendei', item: marketingSiteUrl },
        { '@type': 'ListItem', position: 2, name: 'Encontre', item: `${marketingSiteUrl}/encontre` },
        { '@type': 'ListItem', position: 3, name: business.category?.pluralName ?? categorySlug },
        { '@type': 'ListItem', position: 4, name: business.city },
        { '@type': 'ListItem', position: 5, name: business.name }
      ]
    }] : []
  });

  if (!business) return <MarketingShell><section className="marketing-section"><div className="marketing-container">Carregando estabelecimento…</div></section></MarketingShell>;

  return <MarketingShell>
    <section className="marketing-section">
      <div className="marketing-container directory-business">
        <nav aria-label="Breadcrumb"><Link to="/encontre">Encontre</Link> › <Link to={`/encontre/${categorySlug}`}>{business.category?.pluralName}</Link> › <Link to={`/encontre/${categorySlug}/${citySlug}`}>{business.city}</Link></nav>
        {business.imageUrl ? <img src={business.imageUrl} alt="" /> : null}
        <h1>{business.name}</h1>
        <p>{business.rawAddress}</p>
        <p>{business.phone}</p>
        <WhatsApp business={business} />
        {relatedQuery.data?.items && relatedQuery.data.items.length > 0 ? <section><h2>Outros {business.category?.pluralName} em {business.city}</h2><div className="directory-list">{relatedQuery.data.items.slice(0, 6).map((rel) => <Card key={rel.publicId} business={{ ...rel, category: business.category }} />)}</div></section> : null}
        {business.tenantId === null ? <aside><strong>Ainda não possui App Agendei</strong><p>O atendimento e o agendamento são feitos diretamente com o estabelecimento.</p><Link to="/planos">É proprietário deste estabelecimento? Conheça o Agendei</Link></aside> : null}
      </div>
    </section>
  </MarketingShell>;
}
