import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  retriedChunk: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = { hasError: false, retriedChunk: false };

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true, retriedChunk: false };
  }

  public override componentDidCatch(error: Error): void {
    const isChunkError = /dynamically imported module|importing a module script|loading chunk/iu.test(error.message);
    if (!isChunkError) return;
    try {
      const key = `agendei:chunk-reload:${window.location.pathname}:${error.message}`;
      if (window.sessionStorage.getItem(key) !== null) return;
      window.sessionStorage.setItem(key, '1');
      this.setState({ retriedChunk: true });
      window.location.reload();
    } catch {
      // O fallback visual permanece disponível quando o storage não puder ser usado.
    }
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="page-shell">
          <section className="status-panel" role="alert">
            <p className="eyebrow">Sistema de Serviços</p>
            <h1>Não foi possível exibir a aplicação.</h1>
            <button
              className="action-button"
              type="button"
              onClick={() => {
                window.location.reload();
              }}
            >
              Atualizar página
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
