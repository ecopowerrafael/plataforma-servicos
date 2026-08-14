import type { PlanLimitKey } from './PlanLimitsEditor.js';

export interface PlanPreviewLimit {
  key?: string;
  valueType?: 'INTEGER' | 'BOOLEAN' | 'STRING';
  integerValue?: number | null;
  booleanValue?: boolean;
  stringValue?: string;
}

export interface PlanPreviewBillingOption {
  billingCycle?: string;
  priceCents?: number;
  active?: boolean;
  recommended?: boolean;
}

/** Espelho frouxamente tipado dos valores vivos (possivelmente inválidos) do formulário. */
export interface PlanPreviewValue {
  name?: string;
  subtitle?: string | null;
  shortDescription?: string | null;
  priceCents?: number;
  currency?: string;
  billingOptions?: PlanPreviewBillingOption[];
  trialDays?: number | null;
  highlighted?: boolean;
  badge?: string | null;
  ctaText?: string | null;
  limits?: PlanPreviewLimit[];
}

const cycleSuffix: Record<string, string> = {
  MONTHLY: '/mês',
  QUARTERLY: '/trimestre',
  SEMIANNUAL: '/semestre',
  ANNUAL: '/ano',
  CUSTOM: '',
};
const cycleCaption: Record<string, string> = {
  MONTHLY: 'Cobrança mensal',
  QUARTERLY: 'Cobrança trimestral',
  SEMIANNUAL: 'Cobrança semestral',
  ANNUAL: 'Cobrança anual',
  CUSTOM: 'Cobrança personalizada',
};

/** [singular, plural, texto quando ilimitado] por limite numérico. */
const usageCopy: Record<string, [string, string, string]> = {
  'units.max': ['unidade', 'unidades', 'Unidades ilimitadas'],
  'professionals.max': ['profissional', 'profissionais', 'Profissionais ilimitados'],
  'members.max': ['usuário da equipe', 'usuários da equipe', 'Usuários ilimitados'],
  'services.max': ['serviço', 'serviços', 'Serviços ilimitados'],
  'monthly_appointments.max': ['agendamento/mês', 'agendamentos/mês', 'Agendamentos ilimitados'],
};

const featureCopy: Partial<Record<PlanLimitKey, string>> = {
  'products.enabled': 'Produtos',
  'stock.enabled': 'Controle de estoque',
  'commissions.enabled': 'Comissões',
  'waitlist.enabled': 'Lista de espera',
  'whatsapp.enabled': 'WhatsApp',
  'automations.enabled': 'Automações',
  'integrations.enabled': 'Integrações externas',
  'loyalty.enabled': 'Fidelidade',
  'coupons.enabled': 'Cupons',
  'advanced_reports.enabled': 'Relatórios avançados',
  'branding.customization.enabled': 'Personalização da marca',
  'custom_domain.enabled': 'Domínio próprio',
};

function formatMoneyParts(priceCents: number | undefined, currency: string | undefined) {
  const safeCents = typeof priceCents === 'number' && Number.isFinite(priceCents) ? priceCents : 0;
  const safeCurrency = currency?.trim().length === 3 ? currency : 'BRL';
  const symbol = safeCurrency === 'BRL' ? 'R$' : safeCurrency;
  return {
    symbol,
    amount: new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(safeCents / 100),
  };
}

function primaryOption(options: PlanPreviewBillingOption[] | undefined) {
  const active = (options ?? []).filter((option) => option.active === true);
  return active.find((option) => option.recommended === true) ?? active[0];
}

function usageLines(limits: PlanPreviewLimit[] | undefined) {
  return (limits ?? []).flatMap((limit) => {
    const copy = limit.key === undefined ? undefined : usageCopy[limit.key];
    if (copy === undefined || limit.valueType !== 'INTEGER') return [];
    const [singular, plural, unlimited] = copy;
    const value = limit.integerValue;
    if (value === null || value === undefined || !Number.isFinite(value)) return [unlimited];
    return [`${new Intl.NumberFormat('pt-BR').format(value)} ${value === 1 ? singular : plural}`];
  });
}

function featureLines(limits: PlanPreviewLimit[] | undefined) {
  return (limits ?? []).flatMap((limit) => {
    if (limit.valueType !== 'BOOLEAN' || limit.booleanValue !== true) return [];
    const label = featureCopy[limit.key as PlanLimitKey];
    return label === undefined ? [] : [label];
  });
}

/** Prévia viva de como o plano será apresentado ao estabelecimento na página pública. */
export function PlanPreviewCard({
  value,
  defaultTrialDays,
  benefitTexts,
}: {
  value: PlanPreviewValue;
  defaultTrialDays: number | undefined;
  benefitTexts: string[];
}) {
  const trialDays = value.trialDays ?? defaultTrialDays;
  const option = primaryOption(value.billingOptions);
  const cycle = option?.billingCycle ?? 'MONTHLY';
  const price = formatMoneyParts(option?.priceCents ?? value.priceCents, value.currency);
  const name = value.name?.trim();
  const badge = value.badge?.trim();
  const description = value.shortDescription?.trim() ?? value.subtitle?.trim() ?? '';
  const cta = value.ctaText?.trim();
  const usage = usageLines(value.limits);
  const features = featureLines(value.limits);

  return (
    <aside className="plan-preview-panel">
      <header className="plan-preview-title">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path
            d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <circle cx="12" cy="12" fill="none" r="2.6" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        <h3>Preview do plano</h3>
      </header>
      <article
        className={`plan-preview-card${value.highlighted === true ? ' is-highlighted' : ''}`}
      >
        {badge !== undefined && badge !== '' ? <p className="plan-preview-badge">{badge}</p> : null}
        <div className="plan-preview-body">
          <h4>{name === undefined || name === '' ? 'Nome do plano' : name}</h4>
          {description === '' ? null : <p className="plan-preview-description">{description}</p>}
          <p className="plan-preview-price">
            <span className="plan-preview-symbol">{price.symbol}</span>
            <strong>{price.amount}</strong>
            <span className="plan-preview-cycle">{cycleSuffix[cycle] ?? ''}</span>
          </p>
          <p className="plan-preview-caption">{cycleCaption[cycle] ?? ''}</p>
          {trialDays !== undefined && trialDays > 0 ? (
            <p className="plan-preview-trial">{`${String(trialDays)} dias grátis`}</p>
          ) : null}
          {usage.length > 0 ? (
            <ul className="plan-preview-list">
              {usage.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          {features.length > 0 || benefitTexts.length > 0 ? (
            <ul className="plan-preview-list plan-preview-list--divided">
              {features.map((line) => (
                <li key={line}>{line}</li>
              ))}
              {benefitTexts.map((text) => (
                <li key={`benefit-${text}`}>{text}</li>
              ))}
            </ul>
          ) : null}
          <span className="plan-preview-cta">
            {cta !== undefined && cta !== '' ? cta : 'Começar grátis'}
          </span>
        </div>
      </article>
      <p className="plan-preview-hint">
        Este é um exemplo de como seu plano será exibido para os estabelecimentos.
      </p>
    </aside>
  );
}
