import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
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
              Recarregar
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
