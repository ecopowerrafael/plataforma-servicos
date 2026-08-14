import {
  UpsertWhatsAppConfigSchema,
  WhatsAppConfigSchema,
  WhatsAppConnectionTestSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';

export function WhatsAppSettingsCard({ tenantPublicId, canManage }: { tenantPublicId: string; canManage: boolean }) {
  const client = useQueryClient();
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const config = useQuery({
    queryKey: ['tenant', tenantPublicId, 'whatsapp'],
    queryFn: () => httpClient.request('/tenant/integrations/whatsapp', { schema: WhatsAppConfigSchema, tenantPublicId }),
    retry: false,
  });
  const effectiveInstanceId = instanceId ?? config.data?.instanceId ?? '';
  const save = useMutation({
    mutationFn: (active: boolean) => httpClient.request('/tenant/integrations/whatsapp', {
      method: 'PUT',
      body: UpsertWhatsAppConfigSchema.parse({ active, instanceId: effectiveInstanceId, ...(token.trim() === '' ? {} : { token }) }),
      schema: WhatsAppConfigSchema,
      tenantPublicId,
    }),
    onSuccess: () => {
      setToken('');
      void client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'whatsapp'] });
    },
  });
  const test = useMutation({
    mutationFn: () => httpClient.request('/tenant/integrations/whatsapp/test', {
      method: 'POST', schema: WhatsAppConnectionTestSchema, tenantPublicId,
    }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'whatsapp'] }),
  });
  const item = config.data;
  return (
    <fieldset>
      <legend>WhatsApp</legend>
      {item?.available === false ? (
        <p>Disponivel em outros planos. <a href="/planos">Ver planos</a></p>
      ) : (
        <>
          <p>{item?.configured ? `Configurado - ${item.active ? 'ativo' : 'inativo'}` : 'Nao configurado'}</p>
          <label>ID da instancia<input value={effectiveInstanceId} disabled={!canManage} onChange={(event) => { setInstanceId(event.target.value); }} /></label>
          <label>Token do WPP<input type="password" autoComplete="new-password" placeholder="Manter token salvo" value={token} disabled={!canManage} onChange={(event) => { setToken(event.target.value); }} /></label>
          {item?.tokenConfigured ? <small>Token configurado</small> : null}
          {item?.connectionStatus ? <p>Conexao: {item.connectionStatus === 'CONNECTED' ? 'confirmada' : item.connectionStatus === 'ERROR' ? 'com erro' : item.connectionStatus === 'INACTIVE' ? 'inativa' : 'nao testada'}</p> : null}
          {canManage ? <div className="form-row">
            <button type="button" disabled={save.isPending || effectiveInstanceId.trim() === ''} onClick={() => { save.mutate(true); }}>Salvar e ativar</button>
            {item?.configured ? <button type="button" disabled={test.isPending} onClick={() => { test.mutate(); }}>Testar conexao</button> : null}
            {item?.active ? <button type="button" disabled={save.isPending} onClick={() => { save.mutate(false); }}>Desativar</button> : null}
          </div> : null}
          {test.data ? <p>{test.data.message}</p> : null}
          {save.error instanceof Error || test.error instanceof Error ? <p className="form-error">Nao foi possivel concluir a operacao.</p> : null}
        </>
      )}
    </fieldset>
  );
}
