import { WhatsAppConnectionCard } from './WhatsAppConnectionCard.js';

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
  return <WhatsAppConnectionCard tenantPublicId={tenantPublicId} canManage={canManage} />;
}
