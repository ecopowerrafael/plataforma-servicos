import {
  ProfessionalListResponseSchema,
  ProfessionalServicePublicSchema,
  ProfessionalServicesResponseSchema,
  ProfessionalServiceStatusResponseSchema,
  ServiceListResponseSchema,
  UpsertProfessionalServiceRequestSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';
export function ProfessionalServiceLinks({
  tenantPublicId,
  professionalPublicId,
  servicePublicId,
}: {
  tenantPublicId: string;
  professionalPublicId?: string;
  servicePublicId?: string;
}) {
  const client = useQueryClient();
  const isProfessional = professionalPublicId !== undefined;
  const [target, setTarget] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');
  const [pause, setPause] = useState('');
  const [commissionType, setCommissionType] = useState<'' | 'PERCENTAGE' | 'FIXED'>('');
  const [commissionValue, setCommissionValue] = useState('');
  const url = isProfessional
    ? `/tenant/professionals/${professionalPublicId}/services`
    : `/tenant/services/${servicePublicId ?? ''}/professionals`;
  const links = useQuery({
    queryKey: ['links', url],
    queryFn: () =>
      httpClient.request(url, { schema: ProfessionalServicesResponseSchema, tenantPublicId }),
  });
  const services = useQuery({
    queryKey: ['services', tenantPublicId],
    queryFn: () =>
      httpClient.request('/tenant/services?limit=100&active=true', {
        schema: ServiceListResponseSchema,
        tenantPublicId,
      }),
    enabled: isProfessional,
  });
  const professionals = useQuery({
    queryKey: ['professionals', tenantPublicId],
    queryFn: () =>
      httpClient.request('/tenant/professionals?limit=100&active=true', {
        schema: ProfessionalListResponseSchema,
        tenantPublicId,
      }),
    enabled: !isProfessional,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ['links', url] });
  const save = useMutation({
    mutationFn: () =>
      httpClient.request(
        `/tenant/professionals/${isProfessional ? professionalPublicId : target}/services`,
        {
          method: 'PUT',
          body: UpsertProfessionalServiceRequestSchema.parse({
            servicePublicId: isProfessional ? target : servicePublicId,
            priceCents: price === '' ? null : Number(price),
            durationMinutes: duration === '' ? null : Number(duration),
            hasPostServiceBreak: pause === '' ? null : Number(pause) > 0,
            postServiceBreakMinutes: pause === '' ? null : Number(pause),
            commissionType: commissionType === '' ? null : commissionType,
            commissionValue: commissionValue === '' ? null : Number(commissionValue),
            active: true,
          }),
          schema: ProfessionalServicePublicSchema,
          tenantPublicId,
        },
      ),
    onSuccess: refresh,
  });
  const status = useMutation({
    mutationFn: (item: { serviceId: string; active: boolean }) =>
      httpClient.request(
        `/tenant/professionals/${isProfessional ? professionalPublicId : target}/services/${item.serviceId}/${item.active ? 'activate' : 'deactivate'}`,
        { method: 'POST', schema: ProfessionalServiceStatusResponseSchema, tenantPublicId },
      ),
    onSuccess: refresh,
  });
  return (
    <section className="platform-form">
      <h4>Vínculos</h4>
      <select
        value={target}
        onChange={(e) => {
          setTarget(e.target.value);
        }}
      >
        <option value="">Selecionar</option>
        {isProfessional
          ? services.data?.items.map((x) => (
              <option key={x.publicId} value={x.publicId}>
                {x.name}
              </option>
            ))
          : professionals.data?.items.map((x) => (
              <option key={x.publicId} value={x.publicId}>
                {x.publicName}
              </option>
            ))}
      </select>
      <input
        min="0"
        placeholder="Preço em centavos"
        type="number"
        value={price}
        onChange={(e) => {
          setPrice(e.target.value);
        }}
      />
      <input
        min="1"
        placeholder="Duração"
        type="number"
        value={duration}
        onChange={(e) => {
          setDuration(e.target.value);
        }}
      />
      <input
        min="0"
        placeholder="Pausa"
        type="number"
        value={pause}
        onChange={(e) => {
          setPause(e.target.value);
        }}
      />
      <select
        value={commissionType}
        onChange={(e) => {
          setCommissionType(e.target.value as '' | 'PERCENTAGE' | 'FIXED');
        }}
      >
        <option value="">Comissão padrão</option>
        <option value="PERCENTAGE">Comissão percentual</option>
        <option value="FIXED">Comissão fixa</option>
      </select>
      <input
        min="0"
        placeholder="Valor da comissão"
        type="number"
        value={commissionValue}
        onChange={(e) => {
          setCommissionValue(e.target.value);
        }}
      />
      <button
        disabled={target === '' || save.isPending}
        type="button"
        onClick={() => void save.mutateAsync()}
      >
        Salvar
      </button>
      {links.data?.items.map((x) => (
        <div key={x.publicId}>
          <span>{isProfessional ? x.servicePublicId : x.professionalPublicId}</span>
          <span>{` Preço ${String(x.priceCents ?? 'padrão')} · Duração ${String(x.durationMinutes ?? 'padrão')} · Pausa ${String(x.postServiceBreakMinutes ?? 'padrão')} · Comissão ${x.commissionType === null ? 'padrão' : String(x.commissionValue) + (x.commissionType === 'PERCENTAGE' ? '%' : '')}`}</span>
          <button
            type="button"
            onClick={() => {
              setTarget(isProfessional ? x.servicePublicId : x.professionalPublicId);
              setPrice(x.priceCents === null ? '' : String(x.priceCents));
              setDuration(x.durationMinutes === null ? '' : String(x.durationMinutes));
              setPause(x.postServiceBreakMinutes === null ? '' : String(x.postServiceBreakMinutes));
              setCommissionType(x.commissionType ?? '');
              setCommissionValue(x.commissionValue === null ? '' : String(x.commissionValue));
            }}
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() =>
              void status.mutateAsync({ serviceId: x.servicePublicId, active: !x.active })
            }
          >
            {x.active ? 'Desativar' : 'Ativar'}
          </button>
        </div>
      ))}
    </section>
  );
}
