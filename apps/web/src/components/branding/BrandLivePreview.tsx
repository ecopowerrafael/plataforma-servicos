import { useEffect, useRef, useState } from 'react';

import {
  PREVIEW_MESSAGE_TYPE,
  type PreviewOverride,
} from '../public/use-preview-override.js';

/**
 * Preview real: renderiza a própria página pública do tenant dentro de um
 * iframe de mesma origem, em moldura de celular ou em largura de desktop.
 * Não existe segunda implementação da página pública — o que aparece aqui é
 * exatamente o que o cliente vê, com tema, modelo, cores, banners e conteúdo.
 */
export function BrandLivePreview({
  slug,
  version,
  mode,
  onModeChange,
  override,
}: {
  slug: string;
  /** Muda a cada alteração salva para forçar o recarregamento do iframe. */
  version: number;
  mode: 'mobile' | 'desktop';
  onModeChange: (mode: 'mobile' | 'desktop') => void;
  /** Valores em edição, aplicados só na memória da prévia. */
  override?: PreviewOverride;
}) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const shell = useRef<HTMLDivElement | null>(null);
  const [available, setAvailable] = useState({ width: 0, height: 0 });
  const viewport = mode === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const scale = available.width > 0 && available.height > 0
    ? Math.min(available.width / viewport.width, available.height / viewport.height, 1)
    : 1;
  const visualWidth = viewport.width * scale;
  const visualHeight = viewport.height * scale;
  // O estado de carregamento é derivado da fonte atual: trocar versão ou
  // formato remonta o iframe e o `onLoad` marca como pronto.
  const [loaded, setLoaded] = useState<string | null>(null);
  // `preview=1` evita a splash e sinaliza para a página que ela está embutida,
  // impedindo qualquer aninhamento recursivo.
  const source = `/public/${slug}?preview=1&v=${String(version)}`;
  const loading = loaded !== `${source}|${mode}`;

  // Repassa a edição atual para a prévia. Mesma origem e estrutura fixa; o
  // iframe valida de novo antes de aplicar e nada é persistido.
  useEffect(() => {
    if (loading || override === undefined) return;
    frame.current?.contentWindow?.postMessage(
      { type: PREVIEW_MESSAGE_TYPE, ...override },
      window.location.origin,
    );
  }, [loading, override]);

  useEffect(() => {
    const element = shell.current;
    if (element === null) return;
    const update = () => setAvailable({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="brand-preview">
      <div className="brand-preview-toolbar">
        <div role="group" aria-label="Formato do preview">
          <button
            className={mode === 'mobile' ? 'primary-button button--sm' : 'secondary-button button--sm'}
            type="button"
            aria-pressed={mode === 'mobile'}
            onClick={() => {
              onModeChange('mobile');
            }}
          >
            Celular
          </button>
          <button
            className={
              mode === 'desktop' ? 'primary-button button--sm' : 'secondary-button button--sm'
            }
            type="button"
            aria-pressed={mode === 'desktop'}
            onClick={() => {
              onModeChange('desktop');
            }}
          >
            Desktop
          </button>
        </div>
        <button
          className="text-button button--sm"
          type="button"
          onClick={() => {
            setLoaded(null);
            if (frame.current !== null) frame.current.src = source;
          }}
        >
          Atualizar
        </button>
      </div>
      <div ref={shell} className={`brand-preview-shell brand-preview-shell--${mode}`}>
        <span className="brand-preview-viewport-label">{viewport.width} × {viewport.height}</span>
        <div
          className={`brand-preview-device brand-preview-device--${mode}`}
          style={{ width: visualWidth, height: visualHeight }}
        >
        {loading ? <span className="brand-preview-loading">Carregando página pública…</span> : null}
          <div className="brand-preview-viewport" style={{ width: viewport.width, height: viewport.height, transform: `scale(${scale})` }}>
            <iframe
              ref={frame}
              title="Prévia da página pública"
              src={source}
              loading="lazy"
              onLoad={() => {
                setLoaded(`${source}|${mode}`);
              }}
            />
          </div>
        </div>
      </div>
      <a
        className="secondary-button button--sm"
        href={`/public/${slug}`}
        target="_blank"
        rel="noreferrer"
      >
        Abrir página pública
      </a>
    </div>
  );
}
