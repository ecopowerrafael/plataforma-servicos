import {
  BusinessUnitInputSchema,
  TenantUnitResponseSchema,
  TenantUnitsResponseSchema,
  formatStructuredAddress,
  googleMapsDestination,
  googleMapsEmbed,
  type BusinessUnit,
} from '@plataforma/shared';
import { IconExternalLink, IconMapPin } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { httpClient } from '../../lib/http.js';

type Draft = Pick<
  BusinessUnit,
  | 'postalCode'
  | 'street'
  | 'number'
  | 'complement'
  | 'district'
  | 'city'
  | 'state'
  | 'googleMapsUrl'
>;
const fields: { key: keyof Draft; label: string; placeholder?: string }[] = [
  { key: 'postalCode', label: 'CEP', placeholder: '00000-000' },
  { key: 'street', label: 'Rua / Logradouro' },
  { key: 'number', label: 'Número' },
  { key: 'complement', label: 'Complemento' },
  { key: 'district', label: 'Bairro' },
  { key: 'city', label: 'Cidade' },
  { key: 'state', label: 'Estado', placeholder: 'SP' },
];
const draftOf = (unit: BusinessUnit): Draft => ({
  postalCode: unit.postalCode,
  street: unit.street,
  number: unit.number,
  complement: unit.complement,
  district: unit.district,
  city: unit.city,
  state: unit.state,
  googleMapsUrl: unit.googleMapsUrl,
});

export function BusinessLocationCard({ tenantPublicId }: { tenantPublicId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ['tenant', tenantPublicId, 'units'];
  const units = useQuery({
    queryKey,
    queryFn: () =>
      httpClient.request('/tenant/units', { schema: TenantUnitsResponseSchema, tenantPublicId }),
    retry: false,
  });
  const initial = units.data?.units.find((unit) => unit.isHeadquarters) ?? units.data?.units[0];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = units.data?.units.find((unit) => unit.publicId === selectedId) ?? initial;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const location = draft ?? (selected ? draftOf(selected) : null);
  const lines = useMemo(() => (location ? formatStructuredAddress(location) : []), [location]);
  const embed = location
    ? googleMapsEmbed({ ...location, latitude: selected?.latitude, longitude: selected?.longitude })
    : null;
  const destination = location
    ? googleMapsDestination({
        ...location,
        latitude: selected?.latitude,
        longitude: selected?.longitude,
      })
    : null;
  const save = useMutation({
    mutationFn: async () => {
      if (!selected || !location) throw new Error('Unidade não encontrada.');
      const optional = (value: string | null) => {
        const normalized = value?.trim();
        return normalized === undefined || normalized.length === 0 ? undefined : normalized;
      };
      const body = BusinessUnitInputSchema.parse({
        name: selected.name,
        slug: selected.slug,
        timezone: selected.timezone,
        postalCode: optional(location.postalCode),
        street: optional(location.street),
        number: optional(location.number),
        complement: optional(location.complement),
        district: optional(location.district),
        city: optional(location.city),
        state: optional(location.state),
        countryCode: selected.countryCode ?? 'BR',
        latitude: selected.latitude ?? undefined,
        longitude: selected.longitude ?? undefined,
        googleMapsUrl: optional(location.googleMapsUrl),
      });
      return httpClient.request(`/tenant/units/${selected.publicId}`, {
        method: 'PATCH',
        body,
        schema: TenantUnitResponseSchema,
        tenantPublicId,
      });
    },
    onSuccess: async () => {
      setConfirmed(true);
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  if (units.isPending)
    return <section className="brand-settings-card">Carregando localização…</section>;
  if (!selected || !location) return null;
  return (
    <section
      className="brand-settings-card business-location-card"
      aria-labelledby="business-location-title"
    >
      <div className="location-heading">
        <IconMapPin aria-hidden="true" />
        <div>
          <h3 id="business-location-title">Localização do estabelecimento</h3>
          <p>
            Informe o endereço do estabelecimento e confirme abaixo a localização que seus clientes
            verão.
          </p>
        </div>
      </div>
      {units.data && units.data.units.length > 1 ? (
        <label>
          Unidade
          <select
            value={selected.publicId}
            onChange={(event) => {
              const next = units.data.units.find((unit) => unit.publicId === event.target.value);
              setSelectedId(event.target.value);
              setDraft(next ? draftOf(next) : null);
              setConfirmed(false);
            }}
          >
            <option value={selected.publicId}>{selected.name}</option>
            {units.data.units
              .filter((unit) => unit.publicId !== selected.publicId)
              .map((unit) => (
                <option key={unit.publicId} value={unit.publicId}>
                  {unit.name}
                </option>
              ))}
          </select>
        </label>
      ) : null}
      <div className="location-fields">
        {fields.map(({ key, label, placeholder }) => (
          <label key={key}>
            {label}
            <input
              value={location[key] ?? ''}
              placeholder={placeholder}
              onChange={(event) => {
                setDraft({ ...location, [key]: event.target.value });
                setConfirmed(false);
              }}
            />
          </label>
        ))}
      </div>
      <label>
        Link do estabelecimento no Google Maps
        <input
          type="url"
          value={location.googleMapsUrl ?? ''}
          placeholder="https://www.google.com/maps/…"
          onChange={(event) => {
            setDraft({ ...location, googleMapsUrl: event.target.value });
            setConfirmed(false);
          }}
        />
        <small>
          Se sua empresa já aparece no Google Maps, cole o link aqui para facilitar a identificação
          exata do local.
        </small>
      </label>
      {embed ? (
        <div className="location-confirmation">
          <h4>Confirme a localização</h4>
          <iframe
            title={`Mapa de ${selected.name}`}
            src={embed}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          {lines.length ? (
            <p>
              {lines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </p>
          ) : null}
          {destination ? (
            <a href={destination} target="_blank" rel="noopener noreferrer">
              <IconExternalLink size={17} aria-hidden="true" /> Abrir no Google Maps
            </a>
          ) : null}
        </div>
      ) : null}
      {save.error instanceof Error ? <p className="form-error">{save.error.message}</p> : null}
      {confirmed ? <p className="success-message">Localização confirmada e salva.</p> : null}
      <button
        className="primary-button"
        type="button"
        disabled={save.isPending}
        onClick={() => {
          save.mutate();
        }}
      >
        {save.isPending ? 'Salvando…' : 'Confirmar localização'}
      </button>
    </section>
  );
}
