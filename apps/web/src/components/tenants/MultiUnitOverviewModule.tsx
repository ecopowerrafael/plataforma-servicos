import { MultiUnitOverviewResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';

import { httpClient } from '../../lib/http.js';

export function MultiUnitOverviewModule({ tenantPublicId }: { tenantPublicId: string }) {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const to = now.toISOString();
  const overview = useQuery({
    queryKey: ['tenant', tenantPublicId, 'multi-unit-overview', from, to],
    queryFn: () =>
      httpClient.request(
        `/tenant/multi-unit/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { schema: MultiUnitOverviewResponseSchema, tenantPublicId },
      ),
  });
  return (
    <section className="platform-form" aria-label="Visão multiunidade">
      <h3>Visão multiunidade</h3>
      {overview.isPending ? <p>Carregando unidades…</p> : null}
      {overview.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar a visão multiunidade.</p>
      ) : null}
      <div className="session-grid">
        {overview.data?.units.map((unit) => (
          <article className="info-card" key={unit.unitPublicId}>
            <span>
              {unit.unitName}
              {unit.isHeadquarters ? ' — Matriz' : ''}
            </span>
            <strong>
              {unit.completedAppointments}/{unit.appointments} atendimentos concluídos
            </strong>
            <small>
              {unit.customers} clientes · {unit.professionals} profissionais · R${' '}
              {(Number(unit.revenueCents) / 100).toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
              })}
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}
