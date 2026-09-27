import { useCallback, useEffect, useState } from 'react';

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

export interface PwaInstallState {
  /** O navegador já ofereceu o prompt nativo: dá para instalar com um clique. */
  available: boolean;
  /** Sem prompt nativo (iOS): a instalação precisa ser explicada ao visitante. */
  manual: boolean;
  /** Já está instalado ou rodando em modo standalone. */
  installed: boolean;
  install: () => void;
}

/**
 * Centraliza o ciclo de vida do `beforeinstallprompt` para que o banner, o botão
 * do rodapé e o modal compartilhem o mesmo estado — inclusive o desaparecimento
 * depois que o aplicativo é instalado.
 */
export function usePwaInstall(): PwaInstallState {
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
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    const onDisplayModeChange = (event: MediaQueryListEvent) => {
      if (event.matches) setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    standaloneQuery.addEventListener('change', onDisplayModeChange);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      standaloneQuery.removeEventListener('change', onDisplayModeChange);
    };
  }, []);

  const install = useCallback(() => {
    const event = deferred;
    if (event === null) return;
    setDeferred(null);
    void event.prompt().then(async () => {
      const choice = await event.userChoice;
      if (choice.outcome === 'accepted') setInstalled(true);
    });
  }, [deferred]);

  return {
    available: deferred !== null,
    manual: deferred === null && apple,
    installed: installed || standalone,
    install,
  };
}
