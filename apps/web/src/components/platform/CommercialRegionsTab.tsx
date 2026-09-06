import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { httpClient } from '../../lib/http.js';
import { ErrorState } from './PlatformUi.js';
import { z } from 'zod';

const VALID_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

export function CommercialRegionsTab() {
  const [showForm, setShowForm] = useState(false);
  const [selectedManager, setSelectedManager] = useState<string>('');
  const [formData, setFormData] = useState({
    name: '',
    cities: [{ ibgeCode: '', city: '', state: '' }],
  });

  // Fetch managers
  const managers = useQuery({
    queryKey: ['platform', 'commercial', 'accounts'],
    queryFn: () =>
      httpClient
        .request('/platform/commercial/accounts', {
          schema: z.object({
            data: z.array(
              z.object({
                publicId: z.string(),
                email: z.string(),
                role: z.string(),
              }),
            ),
          }),
        })
        .then((r) => r.data.filter((m) => m.role === 'MANAGER')),
  });

  const handleAddCity = () => {
    setFormData({
      ...formData,
      cities: [...formData.cities, { ibgeCode: '', city: '', state: '' }],
    });
  };

  const handleRemoveCity = (index: number) => {
    setFormData({
      ...formData,
      cities: formData.cities.filter((_, i) => i !== index),
    });
  };

  const handleCityChange = (index: number, field: string, value: string) => {
    const newCities = [...formData.cities];
    newCities[index] = { ...newCities[index], [field]: value };
    setFormData({ ...formData, cities: newCities });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedManager) return;

    // TODO: Call API to create region
    setShowForm(false);
  };

  if (managers.isLoading)
    return (
      <div className="loading">
        <div className="skeleton-line" />
      </div>
    );

  if (managers.error instanceof Error)
    return <ErrorState message="Erro ao carregar gerentes" />;

  return (
    <div className="tab-content">
      <div className="section-header">
        <h3>Regiões Comerciais</h3>
        <button className="action-button" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : '+ Nova Região'}
        </button>
      </div>

      {showForm && (
        <form className="form-card" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="manager">Gerente</label>
            <select
              id="manager"
              value={selectedManager}
              onChange={(e) => setSelectedManager(e.target.value)}
              required
            >
              <option value="">Selecione um gerente</option>
              {managers.data?.map((m) => (
                <option key={m.publicId} value={m.publicId}>
                  {m.email}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="name">Nome da Região</label>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="Ex: Região Sul"
            />
          </div>

          <div className="cities-section">
            <h4>Cidades</h4>
            {formData.cities.map((city, index) => (
              <div key={index} className="city-row">
                <input
                  type="text"
                  placeholder="IBGE (7 dígitos)"
                  value={city.ibgeCode}
                  onChange={(e) => handleCityChange(index, 'ibgeCode', e.target.value)}
                  maxLength={7}
                />
                <input
                  type="text"
                  placeholder="Cidade"
                  value={city.city}
                  onChange={(e) => handleCityChange(index, 'city', e.target.value)}
                />
                <select
                  value={city.state}
                  onChange={(e) => handleCityChange(index, 'state', e.target.value)}
                >
                  <option value="">UF</option>
                  {VALID_STATES.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
                {formData.cities.length > 1 && (
                  <button
                    type="button"
                    className="remove-button"
                    onClick={() => handleRemoveCity(index)}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="secondary-button" onClick={handleAddCity}>
              + Adicionar Cidade
            </button>
          </div>

          <button type="submit" className="action-button">
            Criar Região
          </button>
        </form>
      )}

      <div className="info-box">
        <p>Total de gerentes: <strong>{managers.data?.length || 0}</strong></p>
      </div>

      <style>{`
        .tab-content {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .section-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .form-card {
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 20px;
          background: var(--bg-secondary);
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          margin-bottom: 6px;
          font-weight: 500;
          font-size: 14px;
        }

        .form-group input,
        .form-group select {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 14px;
        }

        .cities-section {
          margin: 20px 0;
          padding: 16px;
          background: var(--bg-primary);
          border-radius: 4px;
        }

        .cities-section h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          font-weight: 600;
        }

        .city-row {
          display: grid;
          grid-template-columns: 120px 1fr 80px auto;
          gap: 8px;
          margin-bottom: 8px;
        }

        .city-row input,
        .city-row select {
          padding: 8px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 13px;
        }

        .remove-button {
          padding: 8px 12px;
          background: rgba(239, 68, 68, 0.1);
          color: rgb(239, 68, 68);
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 600;
        }

        .secondary-button {
          padding: 8px 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          margin-top: 8px;
        }

        .info-box {
          padding: 16px;
          background: var(--bg-secondary);
          border-radius: 8px;
          border-left: 4px solid var(--primary);
        }

        .info-box p {
          margin: 0;
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}
