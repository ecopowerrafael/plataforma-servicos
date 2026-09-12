export const stepTypeNames: Record<string, string> = {
  MESSAGE_OPTIONS: 'Mensagem com respostas',
  WAIT_TEXT: 'Aguardar texto',
  WAIT_LINK: 'Aguardar link',
  MESSAGE_ONLY: 'Mensagem simples',
  MANUAL: 'Atendimento manual',
  END: 'Encerramento',
};

export const actionTypeNames: Record<string, string> = {
  NEXT_STEP: 'Ir para outra etapa',
  END: 'Encerrar fluxo',
  MANUAL: 'Atendimento manual',
};

export const patternTypeNames: Record<string, string> = {
  EXACT: 'Texto exato',
  CONTAINS: 'Contém',
  STARTS_WITH: 'Começa com',
  ENDS_WITH: 'Termina com',
};

export function shouldShowNextStep(stepType: string): boolean {
  return ['WAIT_TEXT', 'WAIT_LINK', 'MESSAGE_ONLY'].includes(stepType);
}

export function insertVariableAtCursor(text: string, cursorPos: number, variable: string): { text: string; newPos: number } {
  const newText = text.substring(0, cursorPos) + variable + text.substring(cursorPos);
  return { text: newText, newPos: cursorPos + variable.length };
}