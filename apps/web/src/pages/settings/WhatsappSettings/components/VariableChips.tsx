import { useRef } from 'react';

export function VariableChips({ onInsert, disabled = false }: { onInsert: (value: string) => void; disabled?: boolean }) {
  return (
    <div className="wa-variable-chips" aria-label="Variáveis disponíveis">
      <span>Inserir variável:</span>
      {['{customerName}', '{tenantName}', '{time}'].map((variable) => (
        <button key={variable} type="button" disabled={disabled} onClick={() => onInsert(variable)}>{variable}</button>
      ))}
    </div>
  );
}

export function useVariableText(initial: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (value: string, current: string, onChange: (next: string) => void) => {
    const el = ref.current;
    if (!el) { onChange(`${current}${value}`); return; }
    const start = el.selectionStart;
    const next = current.slice(0, start) + value + current.slice(el.selectionEnd);
    onChange(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + value.length, start + value.length); });
  };
  return { ref, insert };
}
