import { useQuery } from '@tanstack/react-query';

import { httpClient } from '../../lib/http.js';
import { WhatsAppConnectionCard } from './WhatsAppConnectionCard.js';
import { WhatsAppConnectionSchema } from '@plataforma/shared';
import { WhatsAppMessagesCard } from './WhatsAppMessagesCard.js';

/**
 * Área de WhatsApp do tenant: mostra apenas os controles de conexão úteis
 * para o estabelecimento. Ferramentas internas de diagnóstico seguem no
 * backend, sem serem expostas nesta interface.
 */
export function WhatsAppSettingsCard({
  tenantPublicId,
  canManage,
}: {
  tenantPublicId: string;
  canManage: boolean;
}) {
  const connection = useQuery({
    queryKey: ['tenant', tenantPublicId, 'whatsapp', 'connection'],
    queryFn: () =>
      httpClient.request('/tenant/integrations/whatsapp/status', {
        schema: WhatsAppConnectionSchema,
        tenantPublicId,
      }),
    refetchInterval: false,
    retry: false,
  });

  const whatsappConnected = connection.data?.state === 'CONNECTED';

  return (
    <div className="whatsapp-settings-container">
      <section className="whatsapp-section">
        <h3>Conexão do WhatsApp</h3>
        <WhatsAppConnectionCard tenantPublicId={tenantPublicId} canManage={canManage} />
      </section>
      <section className="whatsapp-section">
        <h3>Mensagens automáticas</h3>
        <WhatsAppMessagesCard
          tenantPublicId={tenantPublicId}
          canManage={canManage}
          whatsappConnected={whatsappConnected ?? false}
        />
      </section>
    </div>
  );
}
