import { IntelligenceTab } from '../../pages/settings/WhatsappSettings/components/IntelligenceTab.js';

export function WhatsAppIntelligencePage({ tenantPublicId, canManage }: { tenantPublicId: string; canManage: boolean }) {
  const focusFirstField = (tabIndex: number, selector: string) => {
    (document.querySelectorAll('.wa-tabs button')[tabIndex] as HTMLButtonElement | undefined)?.click();
    window.setTimeout(() => document.querySelector<HTMLElement>(selector)?.focus(), 0);
  };

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
              <button type="button" className="wa-header-action" onClick={() => focusFirstField(1, '.wa-vocabulary-form select')}>
                + Adicionar nome alternativo
              </button>
              <button type="button" className="wa-header-action" onClick={() => focusFirstField(2, '.wa-add-pattern input')}>
                + Ensinar nova frase
              </button>
              <button type="button" className="wa-header-action wa-header-action-secondary" onClick={() => focusFirstField(3, '.wa-simulator-input textarea')}>
                Testar mensagem
              </button>
            </div>
          )}
        </div>
        <IntelligenceTab tenantPublicId={tenantPublicId} canManage={canManage} />
      </section>
    </main>
  );
}
