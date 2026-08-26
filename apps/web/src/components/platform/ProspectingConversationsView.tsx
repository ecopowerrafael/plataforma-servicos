import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { httpClient } from '../../lib/http.js';
import { formatDate, PageHeader, ErrorState } from './PlatformUi.js';

interface Conversation {
  publicId: string;
  nameSnapshot: string;
  phoneSnapshot: string;
  status: string;
  campaign?: { publicId: string; name: string };
  humanLockType?: string;
  lastInboundAt?: string;
  updatedAt: string;
}

interface Message {
  id: string;
  publicId: string;
  body: string;
  direction: string;
  status: string;
  purpose?: string;
  createdAt: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
}

interface ConversationDetail {
  publicId: string;
  nameSnapshot: string;
  phoneSnapshot: string;
  city?: string;
  status: string;
  currentStep?: number;
  followUpCount?: number;
  lastOutboundAt?: string;
  lastInboundAt?: string;
  respondedAt?: string;
  nextActionAt?: string;
  humanLockType?: string;
  humanLockUntil?: string;
  humanLockReason?: string;
}

const MESSAGE_STATUSES: Record<string, string> = {
  PENDING: 'Pendente',
  SENDING: 'Enviando',
  SENT: 'Enviado',
  DELIVERED: 'Entregue',
  READ: 'Lido',
  FAILED: 'Falhou',
  DELIVERY_UNCERTAIN: 'Entrega incerta',
  DRY_RUN: 'Simulação',
  CANCELED: 'Cancelado',
};

export function ProspectingConversationsView() {
  const queryClient = useQueryClient();
  const [selectedLead, setSelectedLead] = useState<Conversation | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [messageText, setMessageText] = useState('');

  const conversations = useQuery({
    queryKey: ['prospecting', 'conversations', page, search],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '25' });
      if (search) params.set('search', search);
      return httpClient.request(
        `/platform/prospecting/conversations?${params.toString()}`,
        { schema: null as any }
      );
    },
  });

  const detail = useQuery({
    queryKey: ['prospecting', 'conversation', selectedLead?.publicId],
    queryFn: async () => {
      if (!selectedLead) return null;
      const lead = await httpClient.request(
        `/platform/prospecting/campaigns/${selectedLead.campaign?.publicId}/leads/${selectedLead.publicId}`,
        { schema: null as any }
      );
      return lead;
    },
    enabled: selectedLead !== null,
  });

  const messages = useQuery({
    queryKey: ['prospecting', 'messages', selectedLead?.publicId],
    queryFn: () =>
      httpClient.request(
        `/platform/prospecting/conversations/${selectedLead?.publicId}/messages?pageSize=100`,
        { schema: null as any }
      ),
    enabled: selectedLead !== null,
  });

  const takeoverMutation = useMutation({
    mutationFn: (publicId: string) =>
      httpClient.request(`/platform/prospecting/leads/${publicId}/takeover`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospecting'] });
    },
  });

  const releaseMutation = useMutation({
    mutationFn: (publicId: string) =>
      httpClient.request(`/platform/prospecting/leads/${publicId}/release`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prospecting'] });
    },
  });

  const sendMutation = useMutation({
    mutationFn: (body: string) =>
      httpClient.request(`/platform/prospecting/leads/${selectedLead?.publicId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      setMessageText('');
      void queryClient.invalidateQueries({
        queryKey: ['prospecting', 'messages', selectedLead?.publicId],
      });
    },
  });

  const handleSendMessage = () => {
    if (!messageText.trim()) return;
    void sendMutation.mutateAsync(messageText.trim());
  };

  return (
    <section>
      <PageHeader title="Conversas" description="Acompanhe conversas com leads e assuma atendimento." />

      <div className="conversations-container">
        {/* Left: Conversation List */}
        <div className="conversations-list">
          <input
            type="text"
            placeholder="Buscar empresa ou telefone..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="search-input"
          />

          {conversations.isPending ? (
            <div className="skeleton-list">
              <i className="skeleton-item" />
              <i className="skeleton-item" />
              <i className="skeleton-item" />
            </div>
          ) : conversations.error ? (
            <ErrorState message={conversations.error instanceof Error ? conversations.error.message : 'Erro'} />
          ) : !conversations.data?.items?.length ? (
            <div className="empty-list">Nenhuma conversa encontrada</div>
          ) : (
            <>
              {conversations.data.items.map((conv: Conversation) => (
                <div
                  key={conv.publicId}
                  className={`conversation-item ${selectedLead?.publicId === conv.publicId ? 'active' : ''}`}
                  onClick={() => setSelectedLead(conv)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="conv-header">
                    <strong>{conv.nameSnapshot}</strong>
                    {conv.humanLockType === 'MANUAL' && (
                      <span className="badge badge-manual">Manual</span>
                    )}
                  </div>
                  <div className="conv-phone">{conv.phoneSnapshot}</div>
                  {conv.lastInboundAt && (
                    <div className="conv-time">{formatDate(conv.lastInboundAt, true)}</div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        {/* Center: Chat */}
        <div className="conversations-chat">
          {!selectedLead ? (
            <div className="chat-empty">
              <p>Selecione uma conversa para visualizar mensagens</p>
            </div>
          ) : messages.isPending ? (
            <div className="chat-skeleton">
              <i className="skeleton-message" />
              <i className="skeleton-message" />
            </div>
          ) : messages.error ? (
            <ErrorState message={messages.error instanceof Error ? messages.error.message : 'Erro'} />
          ) : !messages.data?.items?.length ? (
            <div className="chat-empty">
              <p>Este lead ainda não possui mensagens</p>
            </div>
          ) : (
            <>
              <div className="messages-list">
                {messages.data.items.map((msg: Message) => (
                  <div
                    key={msg.publicId}
                    className={`message ${msg.direction === 'INBOUND' ? 'inbound' : 'outbound'}`}
                  >
                    <div className="message-content">
                      <p>{msg.body}</p>
                      <span className="message-meta">
                        {formatDate(msg.createdAt, true)} • {MESSAGE_STATUSES[msg.status] || msg.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {detail.data?.humanLockType === 'MANUAL' && (
                <div className="message-composer">
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Digite uma mensagem..."
                    disabled={sendMutation.isPending}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!messageText.trim() || sendMutation.isPending}
                    className="send-button"
                  >
                    {sendMutation.isPending ? 'Enviando...' : 'Enviar'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: Lead Info */}
        <div className="conversations-info">
          {!selectedLead ? (
            <div className="info-empty">Selecione uma conversa</div>
          ) : detail.isPending ? (
            <div className="info-skeleton">
              <i className="platform-skeleton" style={{ height: '300px', display: 'block' }} />
            </div>
          ) : detail.error ? (
            <ErrorState message={detail.error instanceof Error ? detail.error.message : 'Erro'} />
          ) : detail.data ? (
            <>
              <h3>{detail.data.nameSnapshot}</h3>

              <section className="info-section">
                <h4>Informações</h4>
                <dl>
                  <div>
                    <dt>Telefone</dt>
                    <dd>{detail.data.phoneSnapshot}</dd>
                  </div>
                  <div>
                    <dt>Cidade</dt>
                    <dd>{detail.data.city || '—'}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{detail.data.status}</dd>
                  </div>
                  <div>
                    <dt>Follow-ups</dt>
                    <dd>{detail.data.followUpCount || 0}</dd>
                  </div>
                </dl>
              </section>

              <section className="info-section">
                <h4>Automação</h4>
                {detail.data.humanLockType === 'MANUAL' ? (
                  <>
                    <p className="status-badge badge-manual">Atendimento manual</p>
                    <button
                      onClick={() => void releaseMutation.mutateAsync(selectedLead.publicId)}
                      disabled={releaseMutation.isPending}
                      className="secondary-button"
                    >
                      {releaseMutation.isPending ? 'Devolvendo...' : 'Devolver para automação'}
                    </button>
                  </>
                ) : detail.data.status === 'SUPPRESSED' ? (
                  <p className="status-warning">Este contato solicitou não receber mensagens</p>
                ) : (
                  <button
                    onClick={() => void takeoverMutation.mutateAsync(selectedLead.publicId)}
                    disabled={takeoverMutation.isPending}
                    className="primary-button"
                  >
                    {takeoverMutation.isPending ? 'Assumindo...' : 'Assumir atendimento'}
                  </button>
                )}
              </section>

              {detail.data.nextActionAt && (
                <section className="info-section">
                  <h4>Próxima ação</h4>
                  <p>{formatDate(detail.data.nextActionAt, true)}</p>
                </section>
              )}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
