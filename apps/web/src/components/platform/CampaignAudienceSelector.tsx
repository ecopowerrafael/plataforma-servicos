import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { httpClient } from '../../lib/http.js';

interface Category {
  id: string;
  name: string;
}

interface City {
  city: string;
  state: string;
  label: string;
}

interface AudienceItem {
  id: string;
  name: string;
  category: string;
  city: string;
  state: string;
  phone: string;
  status: string;
  lastSent: string | null;
}

interface AudienceCounters {
  total: number;
  withPhone: number;
  neverContacted: number;
  contacted: number;
  suppressed: number;
  eligible: number;
}

interface CampaignAudienceSelectorProps {
  campaignPublicId: string;
  onConfirm?: (selectedIds: string[]) => void;
}

export function CampaignAudienceSelector({ campaignPublicId, onConfirm }: CampaignAudienceSelectorProps) {
  const [categories, setCategories] = useState<bigint[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [contactStatus, setContactStatus] = useState<'all' | 'never' | 'contacted'>('all');
  const [phoneStatus, setPhoneStatus] = useState<'valid' | 'all'>('valid');
  const [page, setPage] = useState(1);
  const [selectedAll, setSelectedAll] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const categoriesQuery = useQuery({
    queryKey: ['prospecting-audience-categories'],
    queryFn: async () => {
      const response = await httpClient.request('/platform/prospecting/audience/categories');
      return (response as any).items as Category[];
    },
  });

  const citiesQuery = useQuery({
    queryKey: ['prospecting-audience-cities', { categories }],
    queryFn: async () => {
      const response = await httpClient.request('/platform/prospecting/audience/cities');
      return (response as any).items as City[];
    },
  });

  const filtersString = useMemo(() => {
    const params = new URLSearchParams();
    if (categories.length > 0) params.append('categories', categories.join(','));
    if (cities.length > 0) params.append('cities', cities.join(','));
    if (search) params.append('search', search);
    if (contactStatus !== 'all') params.append('contactStatus', contactStatus);
    if (phoneStatus !== 'valid') params.append('phoneStatus', phoneStatus);
    return params.toString();
  }, [categories, cities, search, contactStatus, phoneStatus]);

  const countersQuery = useQuery({
    queryKey: ['prospecting-audience-counters', campaignPublicId, filtersString],
    queryFn: async () => {
      const url = `/platform/prospecting/audience/counters/${campaignPublicId}?${filtersString}`;
      return await httpClient.request(url);
    },
  });

  const audienceQuery = useQuery({
    queryKey: ['prospecting-audience-list', campaignPublicId, filtersString, page],
    queryFn: async () => {
      const url = `/platform/prospecting/audience/${campaignPublicId}?${filtersString}&page=${page}&limit=50`;
      return await httpClient.request(url);
    },
  });

  const counters = countersQuery.data as AudienceCounters | undefined;
  const audienceData = audienceQuery.data as any;

  const handleCategoryToggle = (categoryId: string) => {
    const bigintId = BigInt(categoryId);
    setCategories((prev) => (prev.includes(bigintId) ? prev.filter((c) => c !== bigintId) : [...prev, bigintId]));
    setPage(1);
  };

  const handleCityToggle = (city: string) => {
    setCities((prev) => (prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city]));
    setPage(1);
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedAll(checked);
    if (checked && audienceData?.data) {
      setSelectedIds(new Set(audienceData.data.map((item: AudienceItem) => item.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectItem = (itemId: string, checked: boolean) => {
    const newSelection = new Set(selectedIds);
    if (checked) {
      newSelection.add(itemId);
    } else {
      newSelection.delete(itemId);
      setSelectedAll(false);
    }
    setSelectedIds(newSelection);
  };

  return (
    <div className="audience-selector-container">
      <section className="audience-filters">
        <h3>Filtros</h3>

        <div className="filter-group">
          <label>Categorias</label>
          {categoriesQuery.isLoading ? (
            <p>Carregando...</p>
          ) : (
            <div className="checkbox-group">
              {categoriesQuery.data?.map((cat) => (
                <label key={cat.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={categories.includes(BigInt(cat.id))}
                    onChange={(e) => handleCategoryToggle(cat.id)}
                  />
                  {cat.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="filter-group">
          <label>Cidades</label>
          {citiesQuery.isLoading ? (
            <p>Carregando...</p>
          ) : (
            <div className="checkbox-group">
              {citiesQuery.data?.map((city) => (
                <label key={city.label} className="checkbox-label">
                  <input type="checkbox" checked={cities.includes(city.label)} onChange={(e) => handleCityToggle(city.label)} />
                  {city.label}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="filter-group">
          <label>
            Busca por nome
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Filtrar por nome..."
            />
          </label>
        </div>

        <div className="filter-group">
          <label>
            Status de contato
            <select value={contactStatus} onChange={(e) => { setContactStatus(e.target.value as any); setPage(1); }}>
              <option value="all">Todos</option>
              <option value="never">Nunca contatados</option>
              <option value="contacted">Já contatados</option>
            </select>
          </label>
        </div>

        <div className="filter-group">
          <label>
            Telefone
            <select value={phoneStatus} onChange={(e) => { setPhoneStatus(e.target.value as any); setPage(1); }}>
              <option value="valid">Somente com WhatsApp válido</option>
              <option value="all">Todos</option>
            </select>
          </label>
        </div>
      </section>

      <section className="audience-summary">
        <h3>Resumo do Público</h3>
        {countersQuery.isLoading ? (
          <p>Carregando...</p>
        ) : (
          <div className="counters-grid">
            <div className="counter">
              <strong>{counters?.total || 0}</strong>
              <span>Total encontrado</span>
            </div>
            <div className="counter">
              <strong>{counters?.withPhone || 0}</strong>
              <span>Com telefone válido</span>
            </div>
            <div className="counter">
              <strong>{counters?.neverContacted || 0}</strong>
              <span>Nunca contatados</span>
            </div>
            <div className="counter">
              <strong>{counters?.contacted || 0}</strong>
              <span>Já contatados</span>
            </div>
            <div className="counter">
              <strong>{counters?.suppressed || 0}</strong>
              <span>Suprimidos</span>
            </div>
            <div className="counter highlight">
              <strong>{counters?.eligible || 0}</strong>
              <span>Elegíveis</span>
            </div>
          </div>
        )}
      </section>

      <section className="audience-list">
        <h3>Lista de Estabelecimentos</h3>
        {audienceQuery.isLoading ? (
          <p>Carregando...</p>
        ) : (
          <>
            <div className="list-header">
              <label className="checkbox-label">
                <input type="checkbox" checked={selectedAll} onChange={(e) => handleSelectAll(e.target.checked)} />
                Selecionar todos ({audienceData?.pagination?.total || 0})
              </label>
              <span>{selectedIds.size} selecionados</span>
            </div>

            <div className="table-wrap">
              <table className="audience-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}></th>
                    <th>Nome</th>
                    <th>Categoria</th>
                    <th>Localização</th>
                    <th>Telefone</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {audienceData?.data?.map((item: AudienceItem) => (
                    <tr key={item.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={(e) => handleSelectItem(item.id, e.target.checked)}
                        />
                      </td>
                      <td>{item.name}</td>
                      <td>{item.category}</td>
                      <td>{`${item.city}, ${item.state}`}</td>
                      <td>{item.phone}</td>
                      <td>
                        <span className={`status-badge status-${item.status.toLowerCase().replace(/\s/g, '-')}`}>{item.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {audienceData?.pagination && (
              <div className="pagination">
                <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                  Anterior
                </button>
                <span>
                  Página {page} de {audienceData.pagination.pages}
                </span>
                <button disabled={page >= audienceData.pagination.pages} onClick={() => setPage(page + 1)}>
                  Próxima
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {onConfirm && (
        <div className="audience-actions">
          <button className="primary-button" onClick={() => onConfirm(Array.from(selectedIds))}>
            Confirmar Seleção ({selectedIds.size})
          </button>
        </div>
      )}
    </div>
  );
}
