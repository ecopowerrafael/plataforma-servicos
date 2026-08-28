import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { httpClient } from '../../lib/http.js';

interface Category {
  publicId: string;
  name: string;
}

interface City {
  city: string;
  state: string;
  label: string;
}

interface AudienceItem {
  publicId: string;
  name: string;
  category: string;
  city: string;
  state: string;
  phone: string;
  status: string;
}

interface AudienceCounters {
  total: number;
  withPhone: number;
  neverContacted: number;
  contacted: number;
  suppressed: number;
  eligible: number;
}

export interface AudienceSelection {
  mode: 'explicit' | 'allFiltered';
  businessPublicIds?: string[];
  filters?: {
    categoryPublicIds?: string[];
    states?: string[];
    cities?: string[];
    search?: string;
    contactStatus?: 'all' | 'never' | 'sent' | 'responded';
  };
  excludedBusinessPublicIds?: string[];
}

interface CampaignAudienceSelectorProps {
  onSelectionChange?: (selection: AudienceSelection) => void;
  initialSelection?: AudienceSelection;
}

export function CampaignAudienceSelector({ onSelectionChange, initialSelection }: CampaignAudienceSelectorProps) {
  const [categoryPublicIds, setCategoryPublicIds] = useState<string[]>(initialSelection?.filters?.categoryPublicIds || []);
  const [states, setStates] = useState<string[]>(initialSelection?.filters?.states || []);
  const [cities, setCities] = useState<string[]>(initialSelection?.filters?.cities || []);
  const [search, setSearch] = useState(initialSelection?.filters?.search || '');
  const [contactStatus, setContactStatus] = useState<'all' | 'never' | 'sent' | 'responded'>(initialSelection?.filters?.contactStatus || 'all');
  const [page, setPage] = useState(1);
  const [selectionMode, setSelectionMode] = useState<'explicit' | 'allFiltered'>(initialSelection?.mode || 'explicit');
  const [selectedBusinessPublicIds, setSelectedBusinessPublicIds] = useState<Set<string>>(
    new Set(initialSelection?.mode === 'explicit' ? initialSelection.businessPublicIds || [] : [])
  );
  const [excludedBusinessPublicIds, setExcludedBusinessPublicIds] = useState<Set<string>>(
    new Set(initialSelection?.excludedBusinessPublicIds || [])
  );

  const categoriesQuery = useQuery({
    queryKey: ['prospecting-audience-categories'],
    queryFn: async () => {
      const response = await httpClient.request('/platform/prospecting/audience/categories');
      return (response as any).items as Category[];
    },
  });

  const citiesQuery = useQuery({
    queryKey: ['prospecting-audience-cities', { categoryPublicIds }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (categoryPublicIds.length > 0) params.append('categoryPublicIds', categoryPublicIds.join(','));
      const response = await httpClient.request(`/platform/prospecting/audience/cities?${params.toString()}`);
      return (response as any).items as City[];
    },
  });

  const filtersString = useMemo(() => {
    const params = new URLSearchParams();
    if (categoryPublicIds.length > 0) params.append('categoryPublicIds', categoryPublicIds.join(','));
    if (states.length > 0) params.append('states', states.join(','));
    if (cities.length > 0) params.append('cities', cities.join(','));
    if (search) params.append('search', search);
    if (contactStatus !== 'all') params.append('contactStatus', contactStatus);
    return params.toString();
  }, [categoryPublicIds, states, cities, search, contactStatus]);

  const countersQuery = useQuery({
    queryKey: ['prospecting-audience-preview-counters', filtersString],
    queryFn: async () => {
      const url = `/platform/prospecting/audience/preview/counters?${filtersString}`;
      return await httpClient.request(url);
    },
    retry: 1,
    staleTime: 0,
    refetchOnMount: true,
  });

  const audienceQuery = useQuery({
    queryKey: ['prospecting-audience-preview-list', filtersString, page],
    queryFn: async () => {
      const url = `/platform/prospecting/audience/preview?${filtersString}&page=${page}&limit=50`;
      return await httpClient.request(url);
    },
    retry: 1,
    staleTime: 0,
    refetchOnMount: true,
  });

  const counters = countersQuery.data as AudienceCounters | undefined;
  const audienceData = audienceQuery.data as any;

  const handleCategoryToggle = (categoryPublicId: string) => {
    setCategoryPublicIds((prev) =>
      prev.includes(categoryPublicId) ? prev.filter((c) => c !== categoryPublicId) : [...prev, categoryPublicId]
    );
    setPage(1);
  };

  const handleStateToggle = (state: string) => {
    setStates((prev) => (prev.includes(state) ? prev.filter((s) => s !== state) : [...prev, state]));
    // Remove cities from this state when toggling state off
    if (states.includes(state)) {
      setCities((prev) => prev.filter((c) => !c.endsWith(`|${state}`)));
    }
    setPage(1);
  };

  const handleCityToggle = (cityObj: City) => {
    const cityId = `${cityObj.city}|${cityObj.state}`;
    setCities((prev) => (prev.includes(cityId) ? prev.filter((c) => c !== cityId) : [...prev, cityId]));
    setPage(1);
  };

  const handleSelectAllFiltered = (checked: boolean) => {
    setSelectionMode(checked ? 'allFiltered' : 'explicit');
    if (checked) {
      setSelectedBusinessPublicIds(new Set());
      setExcludedBusinessPublicIds(new Set());
    }
  };

  const handleSelectItem = (businessPublicId: string, checked: boolean) => {
    if (selectionMode === 'allFiltered') {
      const newExcluded = new Set(excludedBusinessPublicIds);
      if (checked) {
        newExcluded.delete(businessPublicId);
      } else {
        newExcluded.add(businessPublicId);
      }
      setExcludedBusinessPublicIds(newExcluded);
    } else {
      const newSelection = new Set(selectedBusinessPublicIds);
      if (checked) {
        newSelection.add(businessPublicId);
      } else {
        newSelection.delete(businessPublicId);
      }
      setSelectedBusinessPublicIds(newSelection);
    }
  };

  const computedSelectionCount = useMemo(() => {
    if (selectionMode === 'allFiltered') {
      return Math.max(0, (counters?.eligible || 0) - excludedBusinessPublicIds.size);
    }
    return selectedBusinessPublicIds.size;
  }, [selectionMode, selectedBusinessPublicIds.size, excludedBusinessPublicIds.size, counters?.eligible]);

  const handleConfirm = () => {
    const selection: AudienceSelection =
      selectionMode === 'allFiltered'
        ? {
            mode: 'allFiltered',
            filters: {
              categoryPublicIds: categoryPublicIds.length > 0 ? categoryPublicIds : undefined,
              states: states.length > 0 ? states : undefined,
              cities: cities.length > 0 ? cities : undefined,
              search: search || undefined,
              contactStatus,
            },
            excludedBusinessPublicIds: Array.from(excludedBusinessPublicIds),
          }
        : {
            mode: 'explicit',
            businessPublicIds: Array.from(selectedBusinessPublicIds),
          };

    onSelectionChange?.(selection);
  };

  return (
    <div className="audience-selector-container">
      <section className="audience-filters">
        <h3>Filtros</h3>

        <div className="filter-group">
          <label>Categorias</label>
          {categoriesQuery.isLoading ? (
            <p>Carregando...</p>
          ) : categoriesQuery.isError ? (
            <div className="form-error">
              ✗ Erro ao carregar categorias
              <button onClick={() => void categoriesQuery.refetch()} style={{ marginLeft: '1rem', cursor: 'pointer' }}>
                Tentar novamente
              </button>
            </div>
          ) : (
            <div className="checkbox-group">
              {categoriesQuery.data?.map((cat) => (
                <label key={cat.publicId} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={categoryPublicIds.includes(cat.publicId)}
                    onChange={() => handleCategoryToggle(cat.publicId)}
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
          ) : citiesQuery.isError ? (
            <div className="form-error">
              ✗ Erro ao carregar cidades
              <button onClick={() => void citiesQuery.refetch()} style={{ marginLeft: '1rem', cursor: 'pointer' }}>
                Tentar novamente
              </button>
            </div>
          ) : (
            <div className="checkbox-group">
              {citiesQuery.data?.map((city) => {
                const cityId = `${city.city}|${city.state}`;
                return (
                  <label key={city.label} className="checkbox-label">
                    <input type="checkbox" checked={cities.includes(cityId)} onChange={() => handleCityToggle(city)} />
                    {city.label}
                  </label>
                );
              })}
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
            Status de envio
            <select
              value={contactStatus}
              onChange={(e) => {
                setContactStatus(e.target.value as any);
                setPage(1);
              }}
            >
              <option value="all">Todos</option>
              <option value="never">Nunca enviados</option>
              <option value="sent">Já enviados</option>
              <option value="responded">Responderam</option>
            </select>
          </label>
        </div>
      </section>

      <section className="audience-summary">
        <h3>Resumo do Público</h3>
        {countersQuery.isLoading ? (
          <p>Carregando...</p>
        ) : countersQuery.isError ? (
          <div className="form-error">
            ✗ Erro ao carregar contadores
            <button onClick={() => void countersQuery.refetch()} style={{ marginLeft: '1rem', cursor: 'pointer' }}>
              Tentar novamente
            </button>
          </div>
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
        ) : audienceQuery.isError ? (
          <div className="form-error">
            ✗ Erro ao carregar estabelecimentos
            <button onClick={() => void audienceQuery.refetch()} style={{ marginLeft: '1rem', cursor: 'pointer' }}>
              Tentar novamente
            </button>
          </div>
        ) : (
          <>
            <div className="list-header">
              <label className="checkbox-label">
                <input type="checkbox" checked={selectionMode === 'allFiltered'} onChange={(e) => handleSelectAllFiltered(e.target.checked)} />
                Selecionar todos os {counters?.eligible || 0} resultados
              </label>
              <span>{computedSelectionCount} selecionados</span>
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
                  {audienceData?.data?.map((item: AudienceItem) => {
                    const isSelected =
                      selectionMode === 'allFiltered'
                        ? !excludedBusinessPublicIds.has(item.publicId)
                        : selectedBusinessPublicIds.has(item.publicId);
                    return (
                      <tr key={item.publicId}>
                        <td>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => handleSelectItem(item.publicId, e.target.checked)}
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
                    );
                  })}
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

      <div className="audience-actions">
        <button className="primary-button" onClick={handleConfirm}>
          Confirmar Seleção ({computedSelectionCount})
        </button>
      </div>
    </div>
  );
}
