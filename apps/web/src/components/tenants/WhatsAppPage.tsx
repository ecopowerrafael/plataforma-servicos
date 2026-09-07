import { useQuery } from '@tanstack/react-query';
import { WhatsAppConnectionSchema } from '@plataforma/shared';
import { httpClient } from '../../lib/http.js';
import { WhatsAppConnectionCard } from './WhatsAppConnectionCard.js';
import { WhatsAppAssistantConfigCard } from './WhatsAppAssistantConfigCard.js';
import { WhatsAppMessagesCard } from './WhatsAppMessagesCard.js';
import '../../styles/settings.css';

export function WhatsAppPage({
  tenantPublicId,
  canManage,
}: {
  tenantPublicId: string;
  canManage: boolean;
}) {
  const { data: whatsappStatus } = useQuery({
    queryKey: ['tenant', tenantPublicId, 'whatsapp-status'],
    queryFn: async () => {
      const response = await httpClient.request('/tenant/integrations/whatsapp/status', {
        schema: WhatsAppConnectionSchema,
        tenantPublicId,
      });
      return response;
    },
    retry: false,
  });

  const whatsappConnected = whatsappStatus?.state === 'CONNECTED';

  return (
    <main className="settings-layout whatsapp-page--redesigned">
      <section className="settings-section">
        <div className="settings-header">
          <div>
            <p className="eyebrow">Integrações</p>
            <h1>WhatsApp</h1>
          </div>
        </div>

        <WhatsAppConnectionCard tenantPublicId={tenantPublicId} canManage={canManage} />
        <WhatsAppAssistantConfigCard
          tenantPublicId={tenantPublicId}
          canManage={canManage}
          whatsappConnected={whatsappConnected}
        />
        <WhatsAppMessagesCard
          tenantPublicId={tenantPublicId}
          canManage={canManage}
          whatsappConnected={whatsappConnected}
        />
      </section>
    </main>
  );
}
