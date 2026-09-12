import { useState } from 'react';

import { SERVICE_ICONS } from '../public/service-icons.js';

/** Escolha visual do ícone; apenas a chave curada é persistida. */
export function ServiceIconPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const [search, setSearch] = useState('');
  const term = search.trim().toLocaleLowerCase('pt-BR');
  const icons = SERVICE_ICONS.filter(
    (icon) =>
      term === '' ||
      icon.label.toLocaleLowerCase('pt-BR').includes(term) ||
      icon.key.includes(term),
  );
  return (
    <div className="service-icon-picker">
      <label>
        Ícone do serviço
        <input
          type="search"
          value={search}
          placeholder="Buscar ícone (ex.: barba, corte)"
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
        <small>Usado no aplicativo quando o serviço não tem imagem.</small>
      </label>
      <div className="service-icon-grid">
        <button
          className={`service-icon-option${value === null ? ' is-selected' : ''}`}
          type="button"
          aria-pressed={value === null}
          title="Sem ícone"
          onClick={() => {
            onChange(null);
          }}
        >
          <span aria-hidden="true">—</span>
          <small>Sem ícone</small>
        </button>
        {icons.map(({ key, label, Icon }) => (
          <button
            key={key}
            className={`service-icon-option${value === key ? ' is-selected' : ''}`}
            type="button"
            aria-pressed={value === key}
            title={label}
            onClick={() => {
              onChange(key);
            }}
          >
            <Icon size={22} stroke={1.6} aria-hidden="true" />
            <small>{label}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
