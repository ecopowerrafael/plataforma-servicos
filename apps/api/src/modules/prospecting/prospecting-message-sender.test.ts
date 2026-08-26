import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WApiProspectingMessageSender } from './prospecting-message-sender.service.js';
import { type ProspectingWhatsAppConfigService } from './prospecting-whatsapp-config.service.js';
import { type Environment } from '../../config/environment.js';

describe('WApiProspectingMessageSender', () => {
  let sender: WApiProspectingMessageSender;
  let configService: ProspectingWhatsAppConfigService;
  let environment: Environment;
  let mockFetcher: typeof fetch;

  beforeEach(() => {
    configService = {
      getConfig: vi.fn(),
      getDecryptedToken: vi.fn(),
    } as unknown as ProspectingWhatsAppConfigService;

    environment = {
      PROSPECTING_DRY_RUN: false,
    } as unknown as Environment;

    mockFetcher = vi.fn();
    sender = new WApiProspectingMessageSender(configService, environment, mockFetcher);
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
      expect(mockFetcher).not.toHaveBeenCalled();
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
      expect(mockFetcher).not.toHaveBeenCalled();
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
      expect(mockFetcher).not.toHaveBeenCalled();
    });

    it('retorna INVALID_PHONE para número muito curto', async () => {
      const result = await sender.sendText({
        phone: '123',
        body: 'Teste',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_PHONE');
      expect(mockFetcher).not.toHaveBeenCalled();
    });

    it('normaliza telefone com 11 dígitos adicionando 55', async () => {
      vi.mocked(configService.getDecryptedToken).mockResolvedValue('token-123');
      mockFetcher.mockResolvedValue(
        new Response(JSON.stringify({ messageId: 'ext-456' }), { status: 200 }),
      );

      await sender.sendText({
        phone: '11999999999',
        body: 'Teste',
      });

      const call = vi.mocked(mockFetcher).mock.calls[0];
      const body = JSON.parse((call[1] as RequestInit).body as string);
      expect(body.phone).toBe('5511999999999');
    });

    it('mantém prefixo 55 se já presente', async () => {
      vi.mocked(configService.getDecryptedToken).mockResolvedValue('token-123');
      mockFetcher.mockResolvedValue(
        new Response(JSON.stringify({ messageId: 'ext-456' }), { status: 200 }),
      );

      await sender.sendText({
        phone: '5511999999999',
        body: 'Teste',
      });

      const call = vi.mocked(mockFetcher).mock.calls[0];
      const body = JSON.parse((call[1] as RequestInit).body as string);
      expect(body.phone).toBe('5511999999999');
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
      expect(mockFetcher).not.toHaveBeenCalled();
    });

    it('retorna INVALID_BODY quando body é apenas espaços', async () => {
      const result = await sender.sendText({
        phone: '5511999999999',
        body: '   ',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_BODY');
      expect(mockFetcher).not.toHaveBeenCalled();
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
      expect(mockFetcher).not.toHaveBeenCalled();
    });

    it('descriptografa token corretamente', async () => {
      const decryptedToken = 'secret-token-xyz';
      vi.mocked(configService.getDecryptedToken).mockResolvedValue(decryptedToken);
      mockFetcher.mockResolvedValue(
        new Response(JSON.stringify({ messageId: 'ext-456' }), { status: 200 }),
      );

      await sender.sendText({
        phone: '5511999999999',
        body: 'Teste',
      });

      const call = vi.mocked(mockFetcher).mock.calls[0];
      const headers = (call[1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${decryptedToken}`);
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
      environment.PROSPECTING_DRY_RUN = true;
    });

    it('retorna sucesso com DRY_RUN provider quando habilitado', async () => {
      vi.mocked(configService.getDecryptedToken).mockResolvedValue('token-123');

      const result = await sender.sendText({
        phone: '5511999999999',
        body: 'Teste',
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('DRY_RUN');
      expect(result.externalMessageId).toBeNull();
      expect(mockFetcher).not.toHaveBeenCalled();
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

    it('envia para W-API com instanceId correto', async () => {
      mockFetcher.mockResolvedValue(
        new Response(JSON.stringify({ messageId: 'ext-456' }), { status: 200 }),
      );

      await sender.sendText({
        phone: '5511999999999',
        body: 'Teste',
      });

      const url = vi.mocked(mockFetcher).mock.calls[0][0] as string;
      expect(url).toContain('inst-ABC123');
    });

    it('retorna sucesso com externalMessageId quando W-API retorna 200', async () => {
      mockFetcher.mockResolvedValue(
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

    it('mapeia messageId alternativo (id) quando messageId não está presente', async () => {
      mockFetcher.mockResolvedValue(
        new Response(JSON.stringify({ id: 'alt-id-789' }), { status: 200 }),
      );

      const result = await sender.sendText({
        phone: '5511999999999',
        body: 'Teste',
      });

      expect(result.externalMessageId).toBe('alt-id-789');
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
      mockFetcher.mockResolvedValue(
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
      mockFetcher.mockResolvedValue(
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
      mockFetcher.mockResolvedValue(
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
      mockFetcher.mockResolvedValue(
        new Response(JSON.stringify({ error: true, message: 'Forbidden' }), { status: 403 }),
      );

      const result = await sender.sendText({
        phone: '5511999999999',
        body: 'Teste',
      });

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
    });

    it('retorna retryable=true para timeout', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      mockFetcher.mockRejectedValue(timeoutError);

      const result = await sender.sendText({
        phone: '5511999999999',
        body: 'Teste',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('TIMEOUT');
      expect(result.retryable).toBe(true);
    });

    it('retorna retryable=true para erro de rede', async () => {
      mockFetcher.mockRejectedValue(new Error('Network error'));

      const result = await sender.sendText({
        phone: '5511999999999',
        body: 'Teste',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('NETWORK_ERROR');
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

    it('nunca retorna token real em caso de erro de W-API', async () => {
      mockFetcher.mockResolvedValue(
        new Response(
          JSON.stringify({
            error: true,
            message: 'Falha ao processar. Token: secret-token-123',
          }),
          { status: 400 },
        ),
      );

      const result = await sender.sendText({
        phone: '5511999999999',
        body: 'Teste',
      });

      expect(result.errorMessage).not.toContain('secret-token-123');
      expect(result.errorMessage).not.toContain('Token');
    });

    it('sanitiza mensagens com padrão de token em resposta', async () => {
      mockFetcher.mockResolvedValue(
        new Response(
          JSON.stringify({
            error: true,
            message: 'Erro: Bearer abcdef1234567890abcdef1234567890 inválido',
          }),
          { status: 401 },
        ),
      );

      const result = await sender.sendText({
        phone: '5511999999999',
        body: 'Teste',
      });

      expect(result.errorMessage).toContain('[protegido]');
      expect(result.errorMessage).not.toContain('abcdef1234567890');
    });
  });

  describe('Integração Completa', () => {
    it('processa envio com sucesso do início ao fim', async () => {
      vi.mocked(configService.getConfig).mockResolvedValue({
        publicId: 'pub-123',
        instanceId: 'inst-456',
        isActive: true,
        tokenMasked: '••••••••xyz',
        configured: true,
      });
      vi.mocked(configService.getDecryptedToken).mockResolvedValue('token-real-789');
      environment.PROSPECTING_DRY_RUN = false;

      mockFetcher.mockResolvedValue(
        new Response(JSON.stringify({ messageId: 'wapi-msg-999' }), { status: 200 }),
      );

      const result = await sender.sendText({
        phone: '11987654321',
        body: 'Mensagem de teste',
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('WAPI');
      expect(result.externalMessageId).toBe('wapi-msg-999');

      const call = vi.mocked(mockFetcher).mock.calls[0];
      const url = call[0] as string;
      const init = call[1] as RequestInit;
      const body = JSON.parse(init.body as string);

      expect(url).toContain('inst-456');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-real-789');
      expect(body.phone).toBe('5511987654321');
      expect(body.message).toBe('Mensagem de teste');
    });
  });
});
