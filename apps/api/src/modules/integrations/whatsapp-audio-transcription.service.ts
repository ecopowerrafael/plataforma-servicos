import { type CredentialsCipher } from '../payments/gateway/credentials-cipher.js';
import { type NormalizedWhatsAppEvent } from './whatsapp-inbound.js';
import { EvolutionWhatsAppClient } from './evolution-whatsapp-client.js';
import { AssemblyAiTranscriptionClient } from './assemblyai-transcription.client.js';

const MAX_BYTES = 25 * 1024 * 1024;
const friendly = (code: unknown) => code === 'AUDIO_TOO_LONG' ? 'Esse áudio ficou um pouco longo para eu processar. Envie um áudio de até 5 minutos ou escreva sua mensagem.' : code === 'AUDIO_NOT_CONFIGURED' ? 'Recebi seu áudio, mas este estabelecimento ainda não ativou o atendimento por áudio. Você pode escrever sua mensagem?' : 'Não consegui entender esse áudio. Você pode tentar enviar novamente ou escrever sua mensagem?';
export const normalizeAudioMimeType = (mimeType: string) => (mimeType.split(';', 1)[0] ?? '').trim().toLowerCase();
export const resolveAudioMimeType = (downloadedMimeType: string | null, descriptor: Record<string, unknown>, eventMimeType: string | null) => {
  const audioMessage = descriptor.audioMessage !== null && typeof descriptor.audioMessage === 'object' && !Array.isArray(descriptor.audioMessage) ? descriptor.audioMessage as Record<string, unknown> : {};
  const descriptorMimeType = typeof audioMessage.mimetype === 'string' ? audioMessage.mimetype : typeof audioMessage.mimeType === 'string' ? audioMessage.mimeType : null;
  const effectiveMimeType = downloadedMimeType ?? descriptorMimeType ?? eventMimeType;
  return effectiveMimeType === null ? null : normalizeAudioMimeType(effectiveMimeType);
};

type AudioInboundModel = {
  findUnique(args: unknown): Promise<{ transcriptionStatus: string; transcribedText: string | null; transcriptionExternalId: string | null; encryptedMediaDescriptor: string | null } | null>;
  update(args: unknown): Promise<unknown>;
};
type AudioTenantConfigModel = { findUnique(args: unknown): Promise<{ encryptedAccessToken: string } | null> };
type AudioDatabaseClient = {
  tenantWhatsAppAudioTranscription: { findUnique(args: unknown): Promise<{ enabled: boolean; encryptedApiKey: string | null; maxAudioSeconds: number; languageCode: string } | null> };
  whatsAppInboundEvent: AudioInboundModel;
  tenantWhatsAppConfig: AudioTenantConfigModel;
};

export class WhatsAppAudioTranscriptionService {
  public constructor(private readonly client: AudioDatabaseClient, private readonly cipher: CredentialsCipher | undefined, private readonly evolution: EvolutionWhatsAppClient, private readonly assembly = new AssemblyAiTranscriptionClient()) {}

  public async transcribe(tenantId: bigint, event: NormalizedWhatsAppEvent, inboundId: bigint) {
    const media = event.media;
    if (event.messageType !== 'AUDIO' || media?.kind !== 'AUDIO') return { event, bypassResponseInterval: false };
    const log = (status: string, extra: Record<string, unknown> = {}) => console.info('[WHATSAPP_AUDIO_TRANSCRIPTION]', { tenantId: tenantId.toString(), inboundId: inboundId.toString(), status, ...extra });
    log('STARTED', { provider: 'ASSEMBLYAI' });
    const config = await this.client.tenantWhatsAppAudioTranscription.findUnique({ where: { tenantId } });
    if (!config?.enabled || !config.encryptedApiKey) throw Object.assign(new Error(friendly('AUDIO_NOT_CONFIGURED')), { code: 'AUDIO_NOT_CONFIGURED' });
    if ((media.durationSeconds ?? 0) > (config.maxAudioSeconds ?? 300)) throw Object.assign(new Error(friendly('AUDIO_TOO_LONG')), { code: 'AUDIO_TOO_LONG' });
    const current = await this.client.whatsAppInboundEvent.findUnique({ where: { id: inboundId }, select: { transcriptionStatus: true, transcribedText: true, transcriptionExternalId: true, encryptedMediaDescriptor: true } });
    let transcript = typeof current?.transcribedText === 'string' ? current.transcribedText.trim() : '';
    let externalId: string | null = null;
    const started = Date.now();
    const encrypted = config.encryptedApiKey;
    const storedKey = this.cipher ? this.cipher.decrypt(encrypted).apiKey : undefined;
    const apiKey = typeof storedKey === 'string' ? storedKey : '';
    if (!transcript && current?.transcriptionExternalId && apiKey) {
      const existing = await this.assembly.getTranscript(apiKey, current.transcriptionExternalId);
      if (existing.status === 'completed' && typeof existing.text === 'string' && existing.text.trim()) {
        transcript = existing.text.trim(); externalId = current.transcriptionExternalId;
        await this.client.whatsAppInboundEvent.update({ where: { id: inboundId }, data: { transcriptionStatus: 'COMPLETED', transcribedText: transcript, transcriptionProvider: 'ASSEMBLYAI', transcriptionDurationMs: Date.now() - started, transcriptionCompletedAt: new Date(), transcriptionExternalId: externalId } });
      } else if (existing.status === 'error') throw Object.assign(new Error('Não foi possível processar o áudio.'), { code: 'ASSEMBLYAI_UNAVAILABLE' });
    }
    if (!transcript) {
      await this.client.whatsAppInboundEvent.update({ where: { id: inboundId }, data: { transcriptionStatus: 'PROCESSING', transcriptionProvider: 'ASSEMBLYAI' } });
      if (media.fileSizeBytes !== null && media.fileSizeBytes > MAX_BYTES) throw Object.assign(new Error('Áudio muito grande.'), { code: 'AUDIO_TOO_LARGE' });
      const evolutionConfig = await this.client.tenantWhatsAppConfig.findUnique({ where: { tenantId_provider: { tenantId, provider: 'EVOLUTION' } } });
      if (!evolutionConfig || !this.cipher) throw new Error('Configuração da Evolution indisponível.');
      const stored = this.cipher.decrypt(evolutionConfig.encryptedAccessToken);
      const token = typeof stored.token === 'string' ? stored.token : typeof stored.apiKey === 'string' ? stored.apiKey : '';
      const encryptedDescriptor = current?.encryptedMediaDescriptor;
      const descriptor = event.mediaDownloadDescriptor ?? (encryptedDescriptor && this.cipher ? this.cipher.decrypt(encryptedDescriptor).descriptor as Record<string, unknown> : undefined);
      if (descriptor === undefined) throw new Error('Os dados de mídia do áudio não estão disponíveis para recuperação.');
      const downloaded = await this.evolution.downloadMedia(token, descriptor, MAX_BYTES);
      const normalizedMimeType = resolveAudioMimeType(downloaded.mimeType, descriptor, media.mimeType) ?? '';
      log('DOWNLOADED', { mimeType: normalizedMimeType, fileSizeBytes: downloaded.fileSizeBytes });
      if (!/^audio\/(ogg|opus|mpeg|mp4|x-m4a|wav|webm)$/u.test(normalizedMimeType)) throw new Error('Formato de áudio não suportado.');
      if (!apiKey) throw new Error('Chave de transcrição indisponível.');
      const result = await this.assembly.transcribe({ apiKey, audio: downloaded.buffer, mimeType: normalizedMimeType, languageCode: config.languageCode ?? 'pt', onTranscriptCreated: async (id) => { log('SUBMITTED', { externalIdPresent: id.length > 0 }); await this.client.whatsAppInboundEvent.update({ where: { id: inboundId }, data: { transcriptionStatus: 'PROCESSING', transcriptionProvider: 'ASSEMBLYAI', transcriptionExternalId: id } }); } });
      transcript = result.text;
      externalId = result.transcriptId;
      await this.client.whatsAppInboundEvent.update({ where: { id: inboundId }, data: { transcriptionStatus: 'COMPLETED', transcribedText: transcript, transcriptionProvider: 'ASSEMBLYAI', transcriptionDurationMs: Date.now() - started, transcriptionCompletedAt: new Date(), transcriptionExternalId: externalId, encryptedMediaDescriptor: null } });
      log('COMPLETED', { durationMs: Date.now() - started, textLength: transcript.length });
    }
    if (!transcript) throw Object.assign(new Error(friendly('EMPTY_TRANSCRIPT')), { code: 'EMPTY_TRANSCRIPT' });
    return { event: { ...event, text: transcript, messageType: 'AUDIO_TRANSCRIPT' }, bypassResponseInterval: true };
  }

  public static friendlyMessage(error: unknown) { return friendly((error as { code?: unknown })?.code); }

  public async markFailed(inboundId: bigint) {
    await this.client.whatsAppInboundEvent.update({ where: { id: inboundId }, data: { transcriptionStatus: 'FAILED', transcriptionProvider: 'ASSEMBLYAI', encryptedMediaDescriptor: null } });
  }
}
