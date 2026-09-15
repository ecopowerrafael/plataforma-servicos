import { useEffect } from 'react';

/**
 * Convite de instalação no formato de ficha de loja de aplicativos:
 * ícone, nome, avaliação e um botão de ação único.
 *
 * A avaliação só é exibida quando o chamador informa uma nota real — não há
 * nota sintética, para não mostrar ao cliente final um número inventado.
 */
export function PwaInstallModal({
  appName,
  logoUrl,
  categoryLabel,
  rating,
  manual,
  onInstall,
  onClose,
}: {
  appName: string;
  logoUrl: string | null;
  categoryLabel: string;
  rating?: { average: number; count: number };
  manual: boolean;
  onInstall: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const initial = appName.trim().charAt(0).toLocaleUpperCase('pt-BR');

  return (
    <div className="pwa-modal-backdrop">
      <button aria-label="Fechar" className="pwa-modal-dismiss" onClick={onClose} type="button" />
      <div aria-labelledby="pwa-modal-title" aria-modal="true" className="pwa-modal" role="dialog">
        <button aria-label="Fechar" className="pwa-modal-close" onClick={onClose} type="button">
          ×
        </button>
        <div className="pwa-modal-listing">
          <span aria-hidden="true" className="pwa-modal-icon">
            {logoUrl === null ? initial : <img alt="" src={logoUrl} />}
          </span>
          <div className="pwa-modal-identity">
            <h2 id="pwa-modal-title">{appName}</h2>
            <p className="pwa-modal-category">{categoryLabel}</p>
            {rating === undefined ? null : (
              <p className="pwa-modal-rating">
                <strong>
                  {rating.average.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}
                </strong>
                <span aria-hidden="true" className="pwa-modal-star">
                  ★
                </span>
                <span className="pwa-modal-rating-scale">
                  {`/ 5,0 · ${rating.count.toLocaleString('pt-BR')} avaliações`}
                </span>
              </p>
            )}
          </div>
        </div>

        <ul className="pwa-modal-highlights">
          <li>Agende em poucos toques, direto do seu celular</li>
          <li>Acompanhe seus horários e histórico</li>
          <li>Ocupa quase nada de espaço e abre como um aplicativo</li>
        </ul>

        {manual ? (
          <div className="pwa-modal-manual">
            <p>
              {'No iPhone e iPad, toque em '}
              <strong>Compartilhar</strong>
              {' e depois em '}
              <strong>Adicionar à Tela de Início</strong>
              {'.'}
            </p>
            <button className="pwa-modal-install" onClick={onClose} type="button">
              Entendi
            </button>
          </div>
        ) : (
          <button className="pwa-modal-install" onClick={onInstall} type="button">
            Instalar aplicativo
          </button>
        )}
        <p className="pwa-modal-note">Gratuito · Instalação direta pelo navegador</p>
      </div>
    </div>
  );
}
