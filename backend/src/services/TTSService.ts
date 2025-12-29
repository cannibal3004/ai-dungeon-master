import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { logger } from '../utils/logger';

export interface TTSAudioResult {
  url: string;
  provider: string;
  voiceId?: string;
  durationMs?: number;
}

export class TTSService {
  private enabled: boolean;
  private provider: 'elevenlabs' | 'http' | undefined;
  private elevenKey?: string;
  private elevenVoiceId?: string;
  private httpUrl?: string;

  constructor() {
    this.enabled = (process.env.TTS_ENABLED || 'false').toLowerCase() === 'true';
    const prov = (process.env.TTS_PROVIDER || '').toLowerCase();
    this.provider = (prov === 'elevenlabs' || prov === 'http') ? (prov as any) : undefined;
    this.elevenKey = process.env.ELEVENLABS_API_KEY;
    this.elevenVoiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Default voice (Rachel)
    this.httpUrl = process.env.TTS_HTTP_URL;
  }

  isEnabled(): boolean { return this.enabled && !!this.provider; }

  async synthesize(sessionId: string, text: string): Promise<TTSAudioResult | null> {
    try {
      if (!this.isEnabled()) return null;
      if (!text || text.trim().length === 0) return null;

      const audioDir = path.resolve(__dirname, '..', '..', 'audio', sessionId);
      await fs.promises.mkdir(audioDir, { recursive: true });
      const filename = `${Date.now()}.mp3`;
      const filepath = path.join(audioDir, filename);

      let audioBuffer: Buffer | null = null;

      if (this.provider === 'elevenlabs') {
        if (!this.elevenKey) {
          logger.warn('TTS enabled but ELEVENLABS_API_KEY missing');
          return null;
        }
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.elevenVoiceId}`;
        const resp = await axios.post(url, { text, model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2' }, {
          responseType: 'arraybuffer',
          headers: {
            'xi-api-key': this.elevenKey,
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
          },
          timeout: 20000,
        });
        audioBuffer = Buffer.from(resp.data);
      } else if (this.provider === 'http') {
        if (!this.httpUrl) {
          logger.warn('TTS provider http selected but TTS_HTTP_URL missing');
          return null;
        }
        const resp = await axios.post(this.httpUrl, { text }, { responseType: 'arraybuffer', timeout: 20000 });
        audioBuffer = Buffer.from(resp.data);
      }

      if (!audioBuffer) return null;
      await fs.promises.writeFile(filepath, audioBuffer);
      const publicUrl = `/audio/${sessionId}/${filename}`;
      logger.info('TTS audio generated', { provider: this.provider, url: publicUrl });
      return { url: publicUrl, provider: this.provider!, voiceId: this.elevenVoiceId };
    } catch (err) {
      logger.warn('TTS synthesis failed:', err);
      return null;
    }
  }
}
