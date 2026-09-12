import { IconDeviceMobileShare, IconDownload } from '@tabler/icons-react';

import { usePwaInstall } from './use-pwa-install.js';

/**
 * Faixa de instalação usada nos modelos que não são o App Premium. Só aparece
 * quando o tenant publicou o aplicativo; o prompt do navegador só é aberto
 * depois do clique.
 */
export function PwaInstall({ published, appName }: { published: boolean; appName: string }) {
  const pwa = usePwaInstall();

  if (!published || pwa.installed) return null;

  if (pwa.manual) {
    return (
      <div className="pwa-install" role="note">
        <IconDeviceMobileShare size={18} aria-hidden="true" />
        <p>
          {`Para instalar ${appName}: toque em Compartilhar e depois em "Adicionar à Tela de Início".`}
        </p>
      </div>
    );
  }

  if (!pwa.available) return null;

  return (
    <div className="pwa-install">
      <IconDownload size={18} aria-hidden="true" />
      <p>{`Instale ${appName} no seu celular para agendar mais rápido.`}</p>
      <button className="primary-button" type="button" onClick={pwa.install}>
        Instalar aplicativo
      </button>
    </div>
  );
}
