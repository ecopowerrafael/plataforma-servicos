export interface ProspectingMessageSendInput {
  phone: string;
  body: string;
}

export interface ProspectingMessageSendResult {
  success: boolean;
  provider: 'WAPI' | 'DRY_RUN';
  externalMessageId: string | null;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
}

export interface ProspectingMessageSender {
  sendText(input: ProspectingMessageSendInput): Promise<ProspectingMessageSendResult>;
}
