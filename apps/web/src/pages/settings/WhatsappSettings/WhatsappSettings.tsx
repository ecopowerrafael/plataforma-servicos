import { WhatsAppAssistantConfigResponseSchema, SuccessResponseSchema, type WhatsAppAssistantConfig } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { IconCircleCheck, IconPlugConnected } from '@tabler/icons-react';
import { httpClient } from '../../../lib/http.js';
import { TabsHeader, type WhatsappTab } from './components/TabsHeader.js';
import { MenuSettingsTab } from './components/MenuSettingsTab.js';
import { AutomatedMessagesTab } from './components/AutomatedMessagesTab.js';
import { WhatsappPreview } from './components/WhatsappPreview.js';
import { UnsavedChangesBar } from './components/UnsavedChangesBar.js';

export function WhatsappSettings({ tenantPublicId, canManage, whatsappConnected }: { tenantPublicId: string; canManage: boolean; whatsappConnected: boolean }) {
  const client = useQueryClient(); const [tab, setTab] = useState<WhatsappTab>('menu'); const [draft, setDraft] = useState<WhatsAppAssistantConfig | null>(null); const [saved, setSaved] = useState<WhatsAppAssistantConfig | null>(null);
  const queryKey = ['tenant', tenantPublicId, 'whatsapp-assistant-config'];
  const query = useQuery({ queryKey, queryFn: () => httpClient.request('/tenant/integrations/whatsapp/assistant-config', { schema: WhatsAppAssistantConfigResponseSchema, tenantPublicId }), retry: false });
  useEffect(() => { if (query.data?.config && !saved) { setSaved(query.data.config); setDraft(query.data.config); } }, [query.data, saved]);
  const mutation = useMutation({ mutationFn: (config: WhatsAppAssistantConfig) => httpClient.request('/tenant/integrations/whatsapp/assistant-config', { method: 'PATCH', body: config, schema: SuccessResponseSchema, tenantPublicId }), onSuccess: async () => { await client.invalidateQueries({ queryKey }); setSaved(draft); } });
  const isDirty = !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved);
  const previewMessage = draft?.greeting.enabled ? draft.greeting.newCustomerBody : 'Escolha uma das opções abaixo para continuar.';
  const previewMenu = useMemo(() => draft?.menu.buttons ?? [], [draft]);
  if (query.isPending || !draft) return <div className="wa-settings-loading">Carregando configurações…</div>;
  if (query.isError) return <div className="wa-settings-error">Não foi possível carregar as configurações. <button type="button" onClick={() => query.refetch()}>Tentar novamente</button></div>;
  return <div className="wa-settings-shell"><header className="wa-settings-header"><div><span className="wa-kicker">WHATSAPP · ASSISTENTE VIRTUAL</span><h1>Configurações do WhatsApp</h1><p>Personalize as mensagens automáticas, menus e comportamento do assistente virtual.</p></div><div className={`wa-connection-pill ${whatsappConnected ? 'connected' : ''}`}><span />{whatsappConnected ? 'WhatsApp conectado' : 'WhatsApp não conectado'}</div></header><TabsHeader activeTab={tab} onChange={setTab} /><div className="wa-settings-grid"><main>{tab === 'menu' && <MenuSettingsTab greeting={draft.greeting} menu={draft.menu} canManage={canManage} onChange={(next) => setDraft({ ...draft, ...next })} />}{tab === 'automated' && <AutomatedMessagesTab canManage={canManage} />}{tab === 'connection' && <section className="wa-card wa-connection-card"><IconPlugConnected size={28} /><h2>Conexão do WhatsApp</h2><p>{whatsappConnected ? 'Seu WhatsApp está pronto para receber e enviar mensagens automáticas.' : 'Conecte seu WhatsApp para ativar as mensagens automáticas.'}</p><div className="wa-connection-status"><IconCircleCheck size={18} /> Status: {whatsappConnected ? 'Conectado e operacional' : 'Aguardando conexão'}</div></section>}</main><WhatsappPreview message={previewMessage} showMenu={draft.menu.buttons.some((button) => button.enabled)} menu={previewMenu} /></div>{isDirty && canManage && <UnsavedChangesBar saving={mutation.isPending} disabled={mutation.isPending} onDiscard={() => setDraft(saved)} onSave={() => mutation.mutate(draft)} />}</div>;
}
