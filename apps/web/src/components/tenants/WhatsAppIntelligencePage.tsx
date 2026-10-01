import { useState } from 'react';

import { IntelligenceTab, type IntelligenceAction } from '../../pages/settings/WhatsappSettings/components/IntelligenceTab.js';

export function WhatsAppIntelligencePage({ tenantPublicId, canManage }: { tenantPublicId: string; canManage: boolean }) {
  const [requestedAction, setRequestedAction] = useState<IntelligenceAction>({ type: 'none', id: 0 });

  return (
    <main className="settings-layout whatsapp-page--redesigned">
      <section className="settings-section">
        <div className="settings-header">
          <div>
            <p className="eyebrow">WhatsApp</p>
            <h1>Inteligência do atendimento</h1>
            <p className="settings-subtitle">Ensine ao Agendei como seus clientes falam e teste o que ele entende.</p>
          </div>
          {canManage && (
            <div className="whatsapp-intelligence-header-actions" aria-label="Ações rápidas">
              <button type="button" className="wa-header-action" onClick={() => { setRequestedAction({ type: 'alias', id: Date.now() }); }}>
                + Adicionar nome alternativo
              </button>
              <button type="button" className="wa-header-action" onClick={() => { setRequestedAction({ type: 'training', id: Date.now() }); }}>
                + Ensinar nova frase
              </button>
              <button type="button" className="wa-header-action wa-header-action-secondary" onClick={() => { setRequestedAction({ type: 'test', id: Date.now() }); }}>
                Testar mensagem
              </button>
            </div>
          )}
        </div>
        <IntelligenceTab tenantPublicId={tenantPublicId} canManage={canManage} requestedAction={requestedAction} />
      </section>
    </main>
  );
}
