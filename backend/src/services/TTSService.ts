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
  private provider: 'elevenlabs' | 'http' | 'xtts' | undefined;
  private elevenKey?: string;
  private elevenVoiceId?: string;
  private httpUrl?: string;

  constructor() {
    this.enabled = (process.env.TTS_ENABLED || 'false').toLowerCase() === 'true';
    const prov = (process.env.TTS_PROVIDER || '').toLowerCase();
    this.provider = (prov === 'elevenlabs' || prov === 'http' || prov === 'xtts') ? (prov as any) : undefined;
    this.elevenKey = process.env.ELEVENLABS_API_KEY;
    this.elevenVoiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Default voice (Rachel)
    this.httpUrl = process.env.TTS_HTTP_URL;
  }

  isEnabled(): boolean { return this.enabled && !!this.provider; }

  /**
   * Preprocess text for better TTS pronunciation
   * - Strip basic markdown (bold/italics/links/code) that can confuse TTS
   * - Replace dice notation (1d8, 2d6, etc.) with spelled-out versions
   */
  private preprocessTextForTTS(raw: string): string {
    // Remove common markdown wrappers and code/links
    let text = raw
      .replace(/```[\s\S]*?```/g, '') // drop fenced code blocks entirely
      .replace(/`([^`]+)`/g, '$1') // inline code
      .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
      .replace(/__([^_]+)__/g, '$1') // underline
      .replace(/\*([^*]+)\*/g, '$1') // italics
      .replace(/_([^_]+)_/g, '$1') // italics/underline
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links keep text
      .replace(/[>#]/g, '') // headers/quotes markers
      .replace(/\s{2,}/g, ' ') // collapse whitespace
      .trim();

    const numberWords: Record<number, string> = {
      1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five',
      6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten',
      12: 'twelve', 20: 'twenty', 100: 'one hundred'
    };

    // Replace dice notation (e.g., "1d8" → "one d eight", "2d6" → "two d six")
    return text.replace(/(\d+)d(\d+)/gi, (_match, count, sides) => {
      const countNum = parseInt(count, 10);
      const sidesNum = parseInt(sides, 10);
      const countWord = numberWords[countNum] || count;
      const sidesWord = numberWords[sidesNum] || sides;
      return `${countWord} d ${sidesWord}`;
    });
  }

  async synthesize(sessionId: string, text: string): Promise<TTSAudioResult | null> {
    try {
      if (!this.isEnabled()) return null;
      if (!text || text.trim().length === 0) return null;

      // Preprocess text for better pronunciation
      const processedText = this.preprocessTextForTTS(text);

      const audioDir = path.resolve(__dirname, '..', '..', 'audio', sessionId);
      await fs.promises.mkdir(audioDir, { recursive: true });
      const filename = `${Date.now()}.mp3`;
      const filepath = path.join(audioDir, filename);

      let audioBuffer: Buffer | null = null;
      const timeoutMs = 120000; // XTTS can be slower; bump timeout

      if (this.provider === 'elevenlabs') {
        if (!this.elevenKey) {
          logger.warn('TTS enabled but ELEVENLABS_API_KEY missing');
          return null;
        }
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.elevenVoiceId}`;
        logger.info('[TTS] ElevenLabs request', { url, voiceId: this.elevenVoiceId, model: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2' });
        const resp = await axios.post(url, { text: processedText, model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2' }, {
          responseType: 'arraybuffer',
          headers: {
            'xi-api-key': this.elevenKey,
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
          },
          timeout: timeoutMs,
        });
        logger.info('[TTS] ElevenLabs response', { contentType: resp.headers['content-type'], bytes: resp.data?.length });
        audioBuffer = Buffer.from(resp.data);
      } else if (this.provider === 'http') {
        if (!this.httpUrl) {
          logger.warn('TTS provider http selected but TTS_HTTP_URL missing');
          return null;
        }
        logger.info('[TTS] HTTP provider request', { url: this.httpUrl });
        const resp = await axios.post(this.httpUrl, { text: processedText }, { responseType: 'arraybuffer', timeout: timeoutMs });
        logger.info('[TTS] HTTP provider response', { contentType: resp.headers['content-type'], bytes: resp.data?.length });
        audioBuffer = Buffer.from(resp.data);
      } else if (this.provider === 'xtts') {
        if (!this.httpUrl) {
          logger.warn('TTS provider xtts selected but TTS_HTTP_URL missing');
          return null;
        }
        logger.info('[TTS] XTTS request', { url: this.httpUrl, textLength: processedText.length });
        const resp = await axios.post(this.httpUrl, { text: processedText }, { responseType: 'arraybuffer', timeout: timeoutMs });
        logger.info('[TTS] XTTS response', { contentType: resp.headers['content-type'], bytes: resp.data?.length });
        audioBuffer = Buffer.from(resp.data);
      }

      if (!audioBuffer || audioBuffer.length === 0) {
        logger.warn('[TTS] No audio buffer returned');
        return null;
      }
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
