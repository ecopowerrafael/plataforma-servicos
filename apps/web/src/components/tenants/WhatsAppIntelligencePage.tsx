import { IntelligenceTab } from '../../pages/settings/WhatsappSettings/components/IntelligenceTab.js';

export function WhatsAppIntelligencePage({ tenantPublicId, canManage }: { tenantPublicId: string; canManage: boolean }) {
  return (
    <main className="settings-layout whatsapp-page--redesigned">
      <section className="settings-section">
        <div className="settings-header">
          <div>
            <p className="eyebrow">WhatsApp</p>
            <h1>Inteligência</h1>
            <p className="settings-subtitle">Gerencie vocabulário, treinamento e testes do assistente.</p>
          </div>
        </div>
        <IntelligenceTab tenantPublicId={tenantPublicId} canManage={canManage} />
      </section>
    </main>
  );
}
