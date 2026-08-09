import { useEffect, useRef, useState } from 'react';

export interface ConfirmationRequest {
  title: string;
  description: string;
  confirmLabel: string;
  requiresReason: boolean;
  reasonLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: (reason: string) => Promise<void>;
}

export function ConfirmationDialog({
  request,
  onClose,
}: {
  request: ConfirmationRequest;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  useEffect(() => {
    const openedBy = opener.current;
    closeButton.current?.focus();
    return () => {
      openedBy?.focus();
    };
  }, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('keydown', escape);
    };
  }, [busy, onClose]);
  const submit = async () => {
    if (request.requiresReason && reason.trim().length < 3) {
      setError('Informe um motivo com pelo menos 3 caracteres.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await request.onConfirm(reason.trim());
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'N\u00e3o foi poss\u00edvel concluir a opera\u00e7\u00e3o.',
      );
      setBusy(false);
    }
  };
  return (
    <div className="dialog-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
        aria-describedby="confirmation-description"
        className="dialog"
      >
        <h2 id="confirmation-title">{request.title}</h2>
        <p id="confirmation-description">{request.description}</p>
        {request.requiresReason && (
          <label>
            {request.reasonLabel ?? 'Motivo'}
            <textarea
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
              }}
              disabled={busy}
            />
          </label>
        )}
        {error !== null && <p role="alert">{error}</p>}
        <button ref={closeButton} type="button" onClick={onClose} disabled={busy}>
          Cancelar
        </button>
        <button
          type="button"
          className={request.variant === 'danger' ? 'danger-button' : ''}
          onClick={() => {
            void submit();
          }}
          disabled={busy}
        >
          {busy ? 'Processando\u2026' : request.confirmLabel}
        </button>
      </section>
    </div>
  );
}
