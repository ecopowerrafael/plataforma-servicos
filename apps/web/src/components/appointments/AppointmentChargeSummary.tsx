import { formatChargeSource, formatMoneyCents } from './appointment-format.js';

export function AppointmentChargeSummary({
  source,
  referencePriceCents,
  amountDueCents,
  showValues,
}: {
  source: string | null;
  referencePriceCents: string | null;
  amountDueCents: string | null;
  showValues: boolean;
}) {
  const label = formatChargeSource(source);
  if (label === null) return null;

  return (
    <div className="appointment-charge-summary">
      <span
        className={`ds-badge ${source === 'SERVICE_PRICE' ? 'ds-badge--muted' : 'ds-badge--info'}`}
      >
        {label}
      </span>
      {showValues && source !== 'SERVICE_PRICE' && referencePriceCents !== null && (
        <small>Referência: {formatMoneyCents(referencePriceCents)}</small>
      )}
      {showValues && source !== 'SERVICE_PRICE' && amountDueCents !== null && (
        <small>Devido: {formatMoneyCents(amountDueCents)}</small>
      )}
    </div>
  );
}
