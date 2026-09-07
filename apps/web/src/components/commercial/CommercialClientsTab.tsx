import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { httpClient } from '../../lib/http.js';
import { ErrorState } from '../platform/PlatformUi.js';
import { PaymentModal } from './PaymentModal.js';

const person = z.object({ publicId: z.string(), email: z.string(), displayName: z.string().nullable() });
const teamSchema = z.object({ representatives: z.array(person.extend({ sellers: z.array(person) })), directSellers: z.array(person) });
const clientSchema = z.object({ tenantPublicId: z.string(), tenantName: z.string(), subscription: z.any().nullable().optional(), representative: person.nullable(), seller: person.nullable(), assignedAt: z.string() });
const clientsSchema = z.object({ clients: z.array(clientSchema) });
const regionSchema = z.object({ city: z.string().nullable(), state: z.string().nullable() });
type Client = z.infer<typeof clientSchema>;
const label = (person: z.infer<typeof person>) => person.displayName || person.email;

export function CommercialClientsTab() {
  const cache = useQueryClient();
  const [payment, setPayment] = useState<Client | null>(null);
  const [reassign, setReassign] = useState<Client | null>(null);
  const clients = useQuery({ queryKey: ['commercial', 'clients'], queryFn: () => httpClient.request('/commercial/clients', { schema: clientsSchema }), retry: false });
  const region = useQuery({ queryKey: ['commercial', 'region'], queryFn: () => httpClient.request('/commercial/region', { schema: regionSchema }), retry: false });

  if (clients.isPending) return <div className="loading">Carregando carteira...</div>;
  if (clients.error || !clients.data) return <ErrorState message="Erro ao carregar clientes" />;
  const regionLabel = region.data?.city && region.data.state ? `${region.data.city} - ${region.data.state}` : 'Região em configuração';
  const done = () => { setReassign(null); void cache.invalidateQueries({ queryKey: ['commercial', 'clients'] }); };

  return <div className="clients-content">
    <section className="commercial-region-card">
      <span>MINHA REGIÃO</span>
      <strong>{regionLabel}</strong>
      <p>Todos os clientes cadastrados nessa região entrarão automaticamente na sua carteira.</p>
    </section>
    {clients.data.clients.length === 0 ? <div className="empty-state"><p>Nenhum cliente atribuído</p></div> : <>
      <h3>Clientes Atribuídos</h3>
      <div className="table-container"><table className="data-table"><thead><tr><th>Cliente</th><th>Plano</th><th>Status</th><th>Valor</th><th>Representante</th><th>Vendedor</th><th>Data vínculo</th><th>Ações</th></tr></thead><tbody>{clients.data.clients.map((client) => <tr key={client.tenantPublicId}><td><strong>{client.tenantName}</strong></td><td>{client.subscription?.plan?.code || '-'}</td><td>{client.subscription?.status || 'INACTIVE'}</td><td>{client.subscription?.priceCents == null ? '-' : `R$ ${(Number(client.subscription.priceCents) / 100).toFixed(2)}`}</td><td>{client.representative ? label(client.representative) : '-'}</td><td>{client.seller ? label(client.seller) : '-'}</td><td>{new Date(client.assignedAt).toLocaleDateString('pt-BR')}</td><td><button onClick={() => setReassign(client)}>Reatribuir</button><button className="btn-mark-paid" onClick={() => setPayment(client)}>Marcar como pago</button></td></tr>)}</tbody></table></div>
      <div className="client-cards">{clients.data.clients.map((client) => <article key={client.tenantPublicId}><strong>{client.tenantName}</strong><span>Plano: {client.subscription?.plan?.code || '-'}</span><span>Status: {client.subscription?.status || 'INACTIVE'}</span><button onClick={() => setReassign(client)}>Reatribuir</button></article>)}</div>
    </>}
    {reassign && <ReassignModal client={reassign} close={() => setReassign(null)} done={done} />}
    {payment && <PaymentModal tenantPublicId={payment.tenantPublicId} tenantName={payment.tenantName} onClose={() => setPayment(null)} onSuccess={() => { void clients.refetch(); void cache.invalidateQueries({ queryKey: ['commercial', 'wallet'] }); }} />}
    <style>{css}</style>
  </div>;
}

function ReassignModal({ client, close, done }: { client: Client; close: () => void; done: () => void }) {
  const [repId, setRepId] = useState(client.representative?.publicId || '');
  const [sellerId, setSellerId] = useState(client.seller?.publicId || '');
  const members = useQuery({ queryKey: ['commercial', 'team', 'assignment'], queryFn: () => httpClient.request('/commercial/team', { schema: teamSchema }) });
  const save = useMutation({ mutationFn: () => httpClient.request(`/commercial/clients/${client.tenantPublicId}/assignment`, { method: 'PATCH', body: { representativePublicId: repId || null, sellerPublicId: sellerId || null }, schema: z.object({ success: z.boolean() }) }), onSuccess: done });
  const selected = members.data?.representatives.find((rep) => rep.publicId === repId);
  const sellers = selected?.sellers ?? members.data?.directSellers ?? [];
  return <div className="modal-overlay" onClick={close}><div className="modal-content" onClick={(event) => event.stopPropagation()}><h3>Reatribuir Cliente</h3><p>{client.tenantName}</p><form className="assignment-form" onSubmit={(event) => { event.preventDefault(); if (!save.isPending) save.mutate(); }}><label>Representante<select value={repId} onChange={(event) => { setRepId(event.target.value); setSellerId(''); }}><option value="">Nenhum (direto ao gerente)</option>{members.data?.representatives.map((rep) => <option key={rep.publicId} value={rep.publicId}>{label(rep)}</option>)}</select></label><label>Vendedor<select value={sellerId} onChange={(event) => setSellerId(event.target.value)}><option value="">Nenhum</option>{sellers.map((seller) => <option key={seller.publicId} value={seller.publicId}>{label(seller)}</option>)}</select></label>{save.error && <div className="error-message">Não foi possível salvar.</div>}<div className="modal-actions"><button type="button" onClick={close}>Cancelar</button><button className="action-button" disabled={save.isPending}>{save.isPending ? 'Salvando...' : 'Salvar'}</button></div></form></div></div>;
}

const css = `.clients-content{display:grid;gap:16px}.commercial-region-card{padding:20px 22px;border:1px solid #cddbef;border-radius:14px;background:linear-gradient(135deg,#f2f7ff,#fff)}.commercial-region-card span{display:block;color:#52709f;font-size:11px;font-weight:800;letter-spacing:.12em}.commercial-region-card strong{display:block;margin-top:5px;color:#1d3e70;font-size:22px}.commercial-region-card p{margin:8px 0 0;color:#5e6d82;line-height:1.5}.table-container{overflow-x:auto;border:1px solid var(--border-color);border-radius:8px}.data-table{width:100%;border-collapse:collapse}.data-table th,.data-table td{padding:12px;text-align:left;border-bottom:1px solid var(--border-color)}.data-table td button{margin-right:6px}.btn-mark-paid{padding:6px 10px}.client-cards{display:none}.assignment-form{display:grid;gap:16px}.assignment-form label{display:grid;gap:6px;font-weight:500}.assignment-form select{padding:9px 12px;border:1px solid var(--border-color);border-radius:5px;background:var(--bg-primary);color:var(--text-primary)}.modal-actions{display:flex;gap:12px}@media(max-width:760px){.table-container{display:none}.client-cards{display:grid;gap:12px}.client-cards article{display:grid;gap:7px;padding:14px;border:1px solid var(--border-color);border-radius:8px}}`;
