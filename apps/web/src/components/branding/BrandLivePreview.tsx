import { useRef, useState } from 'react';

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
}: {
  slug: string;
  /** Muda a cada alteração salva para forçar o recarregamento do iframe. */
  version: number;
  mode: 'mobile' | 'desktop';
  onModeChange: (mode: 'mobile' | 'desktop') => void;
}) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  // O estado de carregamento é derivado da fonte atual: trocar versão ou
  // formato remonta o iframe e o `onLoad` marca como pronto.
  const [loaded, setLoaded] = useState<string | null>(null);
  // `preview=1` evita a splash e sinaliza para a página que ela está embutida,
  // impedindo qualquer aninhamento recursivo.
  const source = `/public/${slug}?preview=1&v=${String(version)}`;
  const loading = loaded !== `${source}|${mode}`;

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
      <div className={`brand-preview-device brand-preview-device--${mode}`}>
        {loading ? <span className="brand-preview-loading">Carregando página pública…</span> : null}
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
