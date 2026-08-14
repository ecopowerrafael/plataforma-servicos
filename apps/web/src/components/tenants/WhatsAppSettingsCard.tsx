import {
  UpsertWhatsAppConfigSchema,
  WhatsAppConfigSchema,
  WhatsAppConnectionTestSchema,
  WhatsAppConnectionTestRequestSchema,
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
      method: 'POST',body:WhatsAppConnectionTestRequestSchema.parse({instanceId:effectiveInstanceId,...(token.trim()===''?{}:{token})}), schema: WhatsAppConnectionTestSchema, tenantPublicId,
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
            {item?.configured||token.trim()!=='' ? <button type="button" disabled={test.isPending||effectiveInstanceId.trim()===''} onClick={() => { test.mutate(); }}>Testar conexão</button> : null}
            {item?.active ? <button type="button" disabled={save.isPending} onClick={() => { save.mutate(false); }}>Desativar</button> : null}
          </div> : null}
          {test.data ? <div className={test.data.connected?'success-message':'form-error'}><strong>{test.data.connected?'WhatsApp conectado':test.data.code==='WHATSAPP_INVALID_TOKEN'?'Token inválido':test.data.code==='WHATSAPP_INSTANCE_NOT_FOUND'?'Instância não encontrada':test.data.code==='WHATSAPP_DISCONNECTED'?'WhatsApp desconectado':test.data.code==='WHATSAPP_TIMEOUT'?'Timeout':'Serviço indisponível'}</strong><p>{test.data.message}</p>{test.data.httpStatus!==null||test.data.externalCode!==null?<small>{`${test.data.httpStatus===null?'':`HTTP ${String(test.data.httpStatus)}`}${test.data.externalCode===null?'':` · Código: ${test.data.externalCode}`}`}</small>:null}</div> : null}
          {save.error instanceof Error ? <p className="form-error">{save.error.message}</p> : null}{test.error instanceof Error?<p className="form-error">{test.error.message}</p>:null}
        </>
      )}
    </fieldset>
  );
}
