import { describe, expect, it } from 'vitest';
import { normalizeAudioMimeType } from './whatsapp-audio-transcription.service.js';

describe('normalizeAudioMimeType', () => {
  it('removes codec parameters before validating the media type', () => {
    expect(normalizeAudioMimeType(' Audio/OGG; codecs=opus ')).toBe('audio/ogg');
  });
});
