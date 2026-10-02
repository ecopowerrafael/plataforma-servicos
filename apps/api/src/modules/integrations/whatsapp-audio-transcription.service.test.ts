import { describe, expect, it } from 'vitest';
import { normalizeAudioMimeType, resolveAudioMimeType } from './whatsapp-audio-transcription.service.js';

describe('normalizeAudioMimeType', () => {
  it('removes codec parameters before validating the media type', () => {
    expect(normalizeAudioMimeType(' Audio/OGG; codecs=opus ')).toBe('audio/ogg');
  });
});

describe('resolveAudioMimeType', () => {
  it('prefers MIME returned by Evolution', () => {
    expect(resolveAudioMimeType('audio/mpeg', { audioMessage: { mimetype: 'audio/ogg' } }, 'audio/wav')).toBe('audio/mpeg');
  });

  it('falls back to descriptor MIME when Evolution omits it', () => {
    expect(resolveAudioMimeType(null, { audioMessage: { mimetype: 'audio/ogg; codecs=opus' } }, null)).toBe('audio/ogg');
  });

  it('falls back to event MIME when descriptor has none', () => {
    expect(resolveAudioMimeType(null, { audioMessage: {} }, 'audio/webm; codecs=opus')).toBe('audio/webm');
  });

  it('returns null when no MIME source exists', () => {
    expect(resolveAudioMimeType(null, {}, null)).toBeNull();
  });
});
