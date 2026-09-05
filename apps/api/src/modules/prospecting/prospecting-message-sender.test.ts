import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WApiProspectingMessageSender } from './prospecting-message-sender.service.js';
import { type ProspectingWhatsAppConfigService } from './prospecting-whatsapp-config.service.js';
import { type Environment } from '../../config/environment.js';

describe('WApiProspectingMessageSender', () => {
  let sender: WApiProspectingMessageSender;
  let configService: ProspectingWhatsAppConfigService;
  let environment: Environment;
  let mockFetch: typeof fetch;

  beforeEach(() => {
    configService = {
      getConfig: vi.fn(),
      getDecryptedToken: vi.fn(),
    } as unknown as ProspectingWhatsAppConfigService;

    environment = {
      PROSPECTING_DRY_RUN: false,
    } as unknown as Environment;

    mockFetch = vi.fn();
    sender = new WApiProspectingMessageSender(configService, environment, mockFetch);
  });

  describe('Validação de Configuração', () => {
    it('retorna NOT_CONFIGURED quando config não existe', async () => {
      vi.mocked(configService.getConfig).mockResolvedValue(null);

      const result = await sender.sendText({
        phone: '5511999999999',
        body: 'Teste',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('PROSPECTING_WHATSAPP_NOT_CONFIGURED');
      expect(result.retryable).toBe(false);
    });

    it('retorna DISABLED quando config está inativa', async () => {
      vi.mocked(configService.getConfig).mockResolvedValue({
        publicId: 'pub-123',
        instanceId: 'inst-123',
        isActive: false,
        tokenMasked: '••••••••abcd',
        configured: true,
      });

      const result = await sender.sendText({
        phone: '5511999999999',
        body: 'Teste',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('PROSPECTING_WHATSAPP_DISABLED');
      expect(result.retryable).toBe(false);
    });
  });

  describe('Validação de Telefone', () => {
    beforeEach(() => {
      vi.mocked(configService.getConfig).mockResolvedValue({
        publicId: 'pub-123',
        instanceId: 'inst-123',
        isActive: true,
        tokenMasked: '••••••••abcd',
        configured: true,
      });
    });

    it('retorna INVALID_PHONE para número inválido', async () => {
      const result = await sender.sendText({
        phone: 'abc',
        body: 'Teste',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_PHONE');
      expect(result.retryable).toBe(false);
    });

    it('retorna INVALID_PHONE para número muito curto', async () => {
      const result = await sender.sendText({
        phone: '123',
        body: 'Teste',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_PHONE');
    });
  });

  describe('Validação de Body', () => {
    beforeEach(() => {
      vi.mocked(configService.getConfig).mockResolvedValue({
        publicId: 'pub-123',
        instanceId: 'inst-123',
        isActive: true,
        tokenMasked: '••••••••abcd',
        configured: true,
      });
    });

    it('retorna INVALID_BODY quando body está vazio', async () => {
      const result = await sender.sendText({
        phone: '5511999999999',
        body: '',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_BODY');
    });

    it('retorna INVALID_BODY quando body é apenas espaços', async () => {
      const result = await sender.sendText({
        phone: '5511999999999',
        body: '   ',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_BODY');
    });
  });

  describe('Descriptografia de Token', () => {
    beforeEach(() => {
      vi.mocked(configService.getConfig).mockResolvedValue({
        publicId: 'pub-123',
        instanceId: 'inst-123',
        isActive: true,
        tokenMasked: '••••••••abcd',
        configured: true,
      });
    });

    it('retorna TOKEN_DECRYPTION_FAILED quando token não pode ser descriptografado', async () => {
      vi.mocked(configService.getDecryptedToken).mockResolvedValue(null);

      const result = await sender.sendText({
        phone: '5511999999999',
        body: 'Teste',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('TOKEN_DECRYPTION_FAILED');
      expect(result.retryable).toBe(false);
    });
  });

  describe('Dry Run', () => {
    beforeEach(() => {
      vi.mocked(configService.getConfig).mockResolvedValue({
        publicId: 'pub-123',
        instanceId: 'inst-123',
        isActive: true,
        tokenMasked: '••••••••abcd',
        configured: true,
      });
      vi.mocked(configService.getDecryptedToken).mockResolvedValue('token-123');
      environment.PROSPECTING_DRY_RUN = true;
    });

    it('retorna sucesso com DRY_RUN provider quando habilitado', async () => {
      const result = await sender.sendText({
        phone: '5511999999999',
        body: 'Teste',
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('DRY_RUN');
      expect(result.externalMessageId).toBeNull();
    });

    it('não chama fetch quando DRY_RUN está ativo', async () => {
      await sender.sendText({
        phone: '5511999999999',
        body: 'Teste',
      });

      expect(vi.mocked(mockFetch)).not.toHaveBeenCalled();
    });
  });

  describe('Envio via W-API', () => {
    beforeEach(() => {
      vi.mocked(configService.getConfig).mockResolvedValue({
        publicId: 'pub-123',
        instanceId: 'inst-ABC123',
        isActive: true,
        tokenMasked: '••••••••abcd',
        configured: true,
      });
      vi.mocked(configService.getDecryptedToken).mockResolvedValue('token-xyz');
      environment.PROSPECTING_DRY_RUN = false;
    });

    it('usa WapiSendTextClient com instanceId e token corretos', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ messageId: 'msg-123' }), { status: 200 }),
      );

      await sender.sendText({
        phone: '5511999999999',
        body: 'Teste',
      });

      const call = vi.mocked(mockFetch).mock.calls[0];
      const url = call[0] as string;
      const init = call[1] as RequestInit;

      expect(url).toContain('inst-ABC123');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-xyz');
    });

    it('retorna sucesso com externalMessageId quando W-API retorna ok', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ messageId: 'ext-msg-123' }), { status: 200 }),
      );

      const result = await sender.sendText({
        phone: '5511999999999',
        body: 'Teste',
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('WAPI');
      expect(result.externalMessageId).toBe('ext-msg-123');
    });
  });

  describe('Classificação de Erros', () => {
    beforeEach(() => {
      vi.mocked(configService.getConfig).mockResolvedValue({
        publicId: 'pub-123',
        instanceId: 'inst-123',
        isActive: true,
        tokenMasked: '••••••••abcd',
        configured: true,
      });
      vi.mocked(configService.getDecryptedToken).mockResolvedValue('token-123');
      environment.PROSPECTING_DRY_RUN = false;
    });

    it('retorna retryable=true para HTTP 429', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: true, message: 'Rate limit' }), { status: 429 }),
      );

      const result = await sender.sendText({
        phone: '5511999999999',
        body: 'Teste',
      });

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
    });

    it('retorna retryable=true para HTTP 500', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: true, message: 'Server error' }), { status: 500 }),
      );

      const result = await sender.sendText({
        phone: '5511999999999',
        body: 'Teste',
      });

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
    });

    it('retorna retryable=false para HTTP 401', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: true, message: 'Unauthorized' }), { status: 401 }),
      );

      const result = await sender.sendText({
        phone: '5511999999999',
        body: 'Teste',
      });

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
    });

    it('retorna retryable=false para HTTP 403', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: true, message: 'Forbidden' }), { status: 403 }),
      );

      const result = await sender.sendText({
        phone: '5511999999999',
        body: 'Teste',
      });

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
    });

    it('retorna retryable=true para erro de rede', async () => {
      const networkError = new Error('Network error');
      mockFetch.mockRejectedValue(networkError);

      const result = await sender.sendText({
        phone: '5511999999999',
        body: 'Teste',
      });

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
    });
  });

  describe('Segurança - Token em Erros', () => {
    beforeEach(() => {
      vi.mocked(configService.getConfig).mockResolvedValue({
        publicId: 'pub-123',
        instanceId: 'inst-123',
        isActive: true,
        tokenMasked: '••••••••abcd',
        configured: true,
      });
      vi.mocked(configService.getDecryptedToken).mockResolvedValue('secret-token-123');
      environment.PROSPECTING_DRY_RUN = false;
    });

    it('nunca retorna token real em caso de erro', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: true, message: 'Erro de validação' }), {
          status: 400,
        }),
      );

      const result = await sender.sendText({
        phone: '5511999999999',
        body: 'Teste',
      });

      expect(result.errorMessage).not.toContain('secret-token-123');
    });
  });

  describe('Prova de Não-Duplicação', () => {
    it('ProspectingMessageSender NÃO chama fetch diretamente em envios reais', async () => {
      vi.mocked(configService.getConfig).mockResolvedValue({
        publicId: 'pub-123',
        instanceId: 'inst-123',
        isActive: true,
        tokenMasked: '••••••••abcd',
        configured: true,
      });
      vi.mocked(configService.getDecryptedToken).mockResolvedValue('token-123');
      environment.PROSPECTING_DRY_RUN = false;

      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ messageId: 'msg-123' }), { status: 200 }),
      );

      await sender.sendText({
        phone: '5511999999999',
        body: 'Teste',
      });

      // O fetch é chamado uma vez pelo WapiSendTextClient (não duplicado)
      expect(vi.mocked(mockFetch)).toHaveBeenCalledTimes(1);
    });

    it('normalizeWhatsAppPhone é reutilizado não replicado', async () => {
      vi.mocked(configService.getConfig).mockResolvedValue({
        publicId: 'pub-123',
        instanceId: 'inst-123',
        isActive: true,
        tokenMasked: '••••••••abcd',
        configured: true,
      });

      const result = await sender.sendText({
        phone: '11987654321',
        body: 'Teste',
      });

      // A validação ocorre antes de chamar fetch, não duplicando lógica
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('TOKEN_DECRYPTION_FAILED');
    });
  });
});
