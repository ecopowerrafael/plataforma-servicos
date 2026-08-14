import { IconDeviceMobileShare, IconDownload } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as { standalone?: boolean }).standalone === true;

/** iOS/iPadOS não implementa `beforeinstallprompt`; a instalação é manual. */
const isAppleMobile = () =>
  /iphone|ipad|ipod/iu.test(window.navigator.userAgent) ||
  (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);

/**
 * Botão próprio de instalação. Só aparece quando o tenant publicou o
 * aplicativo; o prompt do navegador só é aberto depois do clique.
 */
export function PwaInstall({ published, appName }: { published: boolean; appName: string }) {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  // Derivados do ambiente, não de estado React: lidos uma vez na montagem.
  const [standalone] = useState(isStandalone);
  const [apple] = useState(isAppleMobile);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!published || standalone || installed) return null;

  if (deferred === null) {
    if (!apple) return null;
    return (
      <div className="pwa-install" role="note">
        <IconDeviceMobileShare size={18} aria-hidden="true" />
        <p>
          {`Para instalar ${appName}: toque em Compartilhar e depois em "Adicionar à Tela de Início".`}
        </p>
      </div>
    );
  }

  return (
    <div className="pwa-install">
      <IconDownload size={18} aria-hidden="true" />
      <p>{`Instale ${appName} no seu celular para agendar mais rápido.`}</p>
      <button
        className="primary-button"
        type="button"
        onClick={() => {
          const event = deferred;
          setDeferred(null);
          void event.prompt().then(async () => {
            const choice = await event.userChoice;
            if (choice.outcome === 'accepted') setInstalled(true);
          });
        }}
      >
        Instalar aplicativo
      </button>
    </div>
  );
}
