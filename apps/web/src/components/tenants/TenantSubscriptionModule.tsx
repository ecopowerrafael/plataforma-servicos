import { SubscriptionChangePreviewSchema, TenantSubscriptionResponseSchema } from '@plataforma/shared';
import { IconCheck, IconMinus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { TenantSubscriptionPayment } from './TenantSubscriptionPayment.js';
import { httpClient } from '../../lib/http.js';
import { usePublicPlans } from '../../marketing/use-public-plans.js';
import {
  InlineAlert,
  ListSkeleton,
  PageHeader,
  SectionCard,
  StatusBadge,
  UsageProgress,
  type BadgeTone,
} from '../ui/AppUi.js';

const statusLabels: Record<string, string> = {
  TRIALING: 'Em teste',
  ACTIVE: 'Ativa',
  PAST_DUE: 'Pagamento pendente',
  SUSPENDED: 'Suspensa',
  CANCELED: 'Cancelada',
  EXPIRED: 'Expirada',
};

const statusTones: Record<string, BadgeTone> = {
  TRIALING: 'info',
  ACTIVE: 'success',
  PAST_DUE: 'warning',
  SUSPENDED: 'danger',
  CANCELED: 'danger',
  EXPIRED: 'danger',
};

const cycleLabels: Record<string, string> = {
  MONTHLY: 'mês',
  QUARTERLY: 'trimestre',
  SEMIANNUAL: 'semestre',
  YEARLY: 'ano',
  ANNUAL: 'ano',
};

/** Rótulos em português para cada chave do catálogo de limites do plano. */
const featureLabels: Record<string, string> = {
  'branding.customization.enabled': 'Personalização da marca',
  'custom_domain.enabled': 'Domínio próprio',
  'advanced_reports.enabled': 'Relatórios avançados',
  'products.enabled': 'Produtos',
  'stock.enabled': 'Controle de estoque',
  'commissions.enabled': 'Comissões',
  'waitlist.enabled': 'Lista de espera',
  'automations.enabled': 'Automações',
  'whatsapp.enabled': 'WhatsApp',
  'integrations.enabled': 'Integrações',
  'loyalty.enabled': 'Programa de fidelidade',
  'coupons.enabled': 'Cupons',
  'priority_support.enabled': 'Suporte prioritário',
};

const limitLabels: Record<string, string> = {
  'units.max': 'Unidades',
  'members.max': 'Membros',
  'professionals.max': 'Profissionais',
  'services.max': 'Serviços',
  'monthly_appointments.max': 'Agendamentos neste mês',
  'storage.megabytes': 'Armazenamento (MB)',
};

const friendlyKey = (key: string) => featureLabels[key] ?? limitLabels[key] ?? key;

const formatMoney = (cents: string, currency: string) =>
  (Number(cents) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: currency === '' ? 'BRL' : currency,
  });

const formatDate = (value: string) => new Date(value).toLocaleDateString('pt-BR');

export function TenantSubscriptionModule({ tenantPublicId }: { tenantPublicId: string }) {
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<ReturnType<typeof SubscriptionChangePreviewSchema.parse> | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const publicPlans = usePublicPlans();
  const query = useQuery({
    queryKey: ['tenant', tenantPublicId, 'subscription'],
    queryFn: () =>
      httpClient.request('/tenant/subscription', {
        schema: TenantSubscriptionResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const data = query.data;
  const cancelScheduledChange = useMutation({ mutationFn: () => httpClient.request('/tenant/subscription/cancel-scheduled-change', { method: 'POST', schema: TenantSubscriptionResponseSchema, tenantPublicId }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'subscription'] }) });
  const previewChange = useMutation({ mutationFn: (planPublicId: string) => httpClient.request('/tenant/subscription/change-preview', { method:'POST', body:{planPublicId}, schema: SubscriptionChangePreviewSchema, tenantPublicId }), onSuccess:setPreview });
  const confirmChange = useMutation({ mutationFn: () => { if (!preview) throw new Error('Selecione um plano.'); return httpClient.request('/tenant/subscription/select-plan',{method:'POST',body:{planPublicId:preview.targetPlan.publicId,billingCycle:preview.targetPlan.billingCycle},schema:TenantSubscriptionResponseSchema,tenantPublicId}); }, onSuccess:(result)=>{setFeedback(preview?.changeType==='UPGRADE'?`Seu plano foi atualizado para ${result.plan.name}.`:`Downgrade agendado para ${formatDate(result.scheduledChange?.effectiveAt ?? new Date().toISOString())}.`);setPreview(null);void queryClient.invalidateQueries({queryKey:['tenant',tenantPublicId,'subscription']});} });
  const quantitative = (data?.limits ?? []).filter((limit) => limit.valueType === 'INTEGER');
  const features = (data?.limits ?? []).filter((limit) => limit.valueType === 'BOOLEAN');
  const included = features.filter((limit) => limit.booleanValue === true);
  const excluded = features.filter((limit) => limit.booleanValue !== true);

  return (
    <div className="ds-stack" aria-label="Minha assinatura">
      <PageHeader
        eyebrow="Assinatura"
        title="Minha assinatura"
        description="Seu plano, o que está incluído e o quanto você já usou."
      />

      {query.isPending ? <ListSkeleton rows={4} /> : null}
      {query.error instanceof Error ? (
        <InlineAlert
          tone="danger"
          title="Não foi possível carregar sua assinatura"
          action={
            <button className="secondary-button" type="button" onClick={() => void query.refetch()}>
              Tentar novamente
            </button>
          }
        >
          Verifique sua conexão e tente novamente.
        </InlineAlert>
      ) : null}

      {data !== undefined && (
        <>
          <section className="app-card subscription-card">
            <header className="subscription-card-header">
              <div>
                <p className="ds-eyebrow">Plano atual</p>
                <h3>{data.plan.name}</h3>
              </div>
              <StatusBadge tone={statusTones[data.subscription.status] ?? 'muted'}>
                {statusLabels[data.subscription.status] ?? data.subscription.status}
              </StatusBadge>
            </header>
            <p className="subscription-price">
              <strong>
                {formatMoney(data.subscription.priceCents, data.subscription.currency)}
              </strong>
              <span>{` / ${cycleLabels[data.subscription.billingCycle] ?? data.subscription.billingCycle}`}</span>
            </p>
            <dl className="platform-details subscription-details">
              {data.commercial.state === 'TRIALING' &&
                data.commercial.trialDaysRemaining !== null && (
                  <div>
                    <dt>Período de teste</dt>
                    <dd>{`Faltam ${String(data.commercial.trialDaysRemaining)} dia(s)`}</dd>
                  </div>
                )}
              {data.subscription.trialEndsAt !== null && (
                <div>
                  <dt>Teste até</dt>
                  <dd>{formatDate(data.subscription.trialEndsAt)}</dd>
                </div>
              )}
              <div>
                <dt>Próxima renovação</dt>
                <dd>{formatDate(data.subscription.currentPeriodEndsAt)}</dd>
              </div>
              {data.commercial.currentPeriodEndsAt !== null && (
                <div>
                  <dt>Vencimento</dt>
                  <dd>{formatDate(data.commercial.currentPeriodEndsAt)}</dd>
                </div>
              )}
              {data.commercial.graceEndsAt !== null && (
                <div>
                  <dt>Carência até</dt>
                  <dd>{formatDate(data.commercial.graceEndsAt)}</dd>
                </div>
              )}
            </dl>
          </section>
          <TenantSubscriptionPayment tenantPublicId={tenantPublicId}/>
          {feedback && <InlineAlert tone="success" title={feedback}><button type="button" onClick={()=>setFeedback(null)}>Fechar</button></InlineAlert>}
          {data.scheduledChange !== null && <InlineAlert tone="warning" title={`Mudança agendada para ${formatDate(data.scheduledChange.effectiveAt)}`} action={<button className="secondary-button" type="button" disabled={cancelScheduledChange.isPending} onClick={() => void cancelScheduledChange.mutate()}>Cancelar mudança</button>}>{`Seu plano atual continuará disponível até essa data. Depois, sua assinatura passará para ${data.scheduledChange.plan.name}. Seus dados não serão apagados.`}</InlineAlert>}
          <SectionCard title="Outros planos" description="Compare opções públicas disponíveis para sua assinatura.">{publicPlans.isPending ? <p>Carregando planos…</p> : publicPlans.data?.plans.filter(plan=>plan.publicId!==data.plan.publicId).map(plan=>{const scheduled=data.scheduledChange?.plan.publicId===plan.publicId;return <article className="subscription-usage" key={plan.publicId}><p className="ds-eyebrow">{plan.name}</p><p>{plan.shortDescription ?? plan.description}</p><strong>{formatMoney(plan.priceCents,plan.currency)}</strong><button type="button" disabled={scheduled||previewChange.isPending} onClick={()=>void previewChange.mutate(plan.publicId)}>{scheduled?'Downgrade agendado':previewChange.isPending?'Comparando planos…':'Comparar plano'}</button></article>})}</SectionCard>
          {preview && <div className="app-modal-backdrop" role="presentation" onMouseDown={()=>!confirmChange.isPending&&setPreview(null)}><section className="app-modal" role="dialog" aria-modal="true" aria-labelledby="plan-change-title" onMouseDown={e=>e.stopPropagation()}><h2 id="plan-change-title">{preview.changeType==='UPGRADE'?`Fazer upgrade para ${preview.targetPlan.name}?`:`Revisar downgrade para ${preview.targetPlan.name}`}</h2><p>Plano atual: {preview.currentPlan.name} · Novo plano: {preview.targetPlan.name}</p><p>Novo valor: {formatMoney(preview.targetPlan.priceCents,preview.targetPlan.currency)} / {cycleLabels[preview.targetPlan.billingCycle] ?? preview.targetPlan.billingCycle}</p>{preview.changeType==='UPGRADE'?<><h3>Você ganha</h3>{preview.gainedFeatures.map(x=><p key={x.key}>✓ {x.label}</p>)}{preview.increasedLimits.map(x=><p key={x.key}>{x.label}: {x.currentValue} → {x.targetValue}</p>)}</>:<><p>Seu plano atual continuará ativo até o fim do período contratado.{preview.effectiveAt?` A mudança está prevista para ${formatDate(preview.effectiveAt)}.`:''}</p><h3>Você perderá</h3>{preview.lostFeatures.map(x=><p key={x.key}>− {x.label}</p>)}<h3>Seus limites serão reduzidos</h3>{preview.reducedLimits.map(x=><p key={x.key}>{x.label}: {x.currentValue} → {x.targetValue}</p>)}{preview.usageConflicts.length>0&&<InlineAlert tone="warning" title="Atenção ao uso atual">{preview.usageConflicts.map(x=><p key={x.key}>{`Você possui ${x.currentUsage} ${x.label}, mas o novo plano permite ${x.targetLimit}.`}</p>)}Seus dados existentes não serão apagados.</InlineAlert>}</>}<button type="button" disabled={confirmChange.isPending} onClick={()=>void confirmChange.mutate()}>{confirmChange.isPending?(preview.changeType==='UPGRADE'?'Atualizando plano…':'Agendando mudança…'):(preview.changeType==='UPGRADE'?'Confirmar upgrade':'Agendar downgrade')}</button><button type="button" disabled={confirmChange.isPending} onClick={()=>setPreview(null)}>{preview.changeType==='UPGRADE'?'Cancelar':'Manter meu plano atual'}</button></section></div>}

          {data.commercial.state === 'TRIALING' && data.commercial.trialEndsAt !== null && (
            <InlineAlert
              tone="info"
              title={`Seu período de teste termina em ${formatDate(data.commercial.trialEndsAt)}.`}
            >
              {data.commercial.trialDaysRemaining === null
                ? 'Aproveite para configurar tudo antes do fim do teste.'
                : `Faltam ${String(data.commercial.trialDaysRemaining)} dia(s).`}
            </InlineAlert>
          )}

          {data.commercial.state !== 'TRIALING' && data.commercial.state !== 'ACTIVE' && (
            <InlineAlert tone="danger" title="Sua assinatura precisa de atenção">
              {data.commercial.adminMessage ??
                'Entre em contato com o suporte para regularizar a assinatura.'}
            </InlineAlert>
          )}

          {quantitative.length > 0 && (
            <SectionCard title="Uso do plano" description="Quanto do seu plano já está em uso.">
              <div className="subscription-usage-grid">
                {quantitative.map((limit) => {
                  const total =
                    limit.integerValue === null ? null : Number.parseInt(limit.integerValue, 10);
                  const used = limit.usage;
                  return (
                    <article className="subscription-usage" key={limit.key}>
                      <p className="ds-eyebrow">{friendlyKey(limit.key)}</p>
                      <strong>
                        {used === null
                          ? (total?.toLocaleString('pt-BR') ?? 'Ilimitado')
                          : total === null
                            ? used.toLocaleString('pt-BR')
                            : `${used.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}`}
                      </strong>
                      {total === null ? <small>Ilimitado</small> : null}
                      {used === null ? null : <UsageProgress used={used} total={total} />}
                    </article>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {features.length > 0 && (
            <SectionCard
              title="Recursos incluídos"
              description="O que está disponível no seu plano atual."
            >
              <ul className="subscription-features">
                {included.map((limit) => (
                  <li className="is-included" key={limit.key}>
                    <IconCheck size={16} aria-hidden="true" />
                    {friendlyKey(limit.key)}
                  </li>
                ))}
                {excluded.map((limit) => (
                  <li className="is-excluded" key={limit.key}>
                    <IconMinus size={16} aria-hidden="true" />
                    {friendlyKey(limit.key)}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}
