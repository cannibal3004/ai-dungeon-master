import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { PassThrough } from 'stream';
import crypto from 'crypto';

export interface TTSAudioResult {
  url: string;
  provider: string;
  voiceId?: string;
  durationMs?: number;
}

export class TTSService {
  private enabled: boolean;
  private provider: 'elevenlabs' | 'http' | 'xtts' | 'fish-audio' | undefined;
  private elevenKey?: string;
  private elevenVoiceId?: string;
  private httpUrl?: string;
  private fishAudioUrl?: string;
  private fishAudioApiKey?: string;
  private fishAudioVoiceId?: string;
  private fishAudioStreaming: boolean;
  private fishAudioFormat: 'wav' | 'pcm' | 'mp3';
  private publicBaseUrl?: string;
  private pendingStreams: Map<string, { sessionId: string; text: string; createdAt: number; cacheFilename: string }>;

  constructor() {
    this.enabled = (process.env.TTS_ENABLED || 'false').toLowerCase() === 'true';
    const prov = (process.env.TTS_PROVIDER || '').toLowerCase();
    this.provider = (prov === 'elevenlabs' || prov === 'http' || prov === 'xtts' || prov === 'fish-audio') ? (prov as any) : undefined;
    this.elevenKey = process.env.ELEVENLABS_API_KEY;
    this.elevenVoiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Default voice (Rachel)
    this.httpUrl = process.env.TTS_HTTP_URL;
    this.fishAudioUrl = process.env.FISH_AUDIO_BASE_URL;
    this.fishAudioApiKey = process.env.FISH_AUDIO_API_KEY;
    this.fishAudioVoiceId = process.env.FISH_AUDIO_VOICE_ID || '1';
    this.fishAudioStreaming = (process.env.FISH_AUDIO_STREAMING || 'true').toLowerCase() === 'true';
    this.fishAudioFormat = (process.env.FISH_AUDIO_FORMAT || 'wav').toLowerCase() as 'wav' | 'pcm' | 'mp3';
    const base = process.env.TTS_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL;
    this.publicBaseUrl = base ? base.replace(/\/$/, '') : undefined;
    this.pendingStreams = new Map();

    logger.info('[TTS] Init', {
      enabled: this.enabled,
      provider: this.provider,
      httpUrlPresent: !!this.httpUrl,
      elevenKeyPresent: !!this.elevenKey,
    });
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

  private resolveFormatForStreaming(): 'wav' | 'pcm' | 'mp3' {
    logger.warn('[TTS] Using WAV for streaming (supports progressive playback)');
    this.fishAudioFormat = 'wav';
    return 'wav';
  }
  private toPublicUrl(relativePath: string): string {
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl}${relativePath}`;
    }
    return relativePath;
  }

  private createStreamToken(sessionId: string, text: string): string {
    // Clean up old tokens (older than 10 minutes)
    const now = Date.now();
    for (const [token, meta] of this.pendingStreams.entries()) {
      if (now - meta.createdAt > 10 * 60 * 1000) {
        this.pendingStreams.delete(token);
      }
    }
    
    let token: string;
    do {
      token = Math.random().toString(36).substring(2, 15);
    } while (this.pendingStreams.has(token));
    
    const ext = 'wav'; // streaming uses wav currently
    const textHash = crypto.createHash('md5').update(text).digest('hex').substring(0, 12);
    const cacheFilename = `${textHash}.${ext}`;
    this.pendingStreams.set(token, { sessionId, text, createdAt: now, cacheFilename });
    return token;
  }

  consumeStreamToken(token: string): { sessionId: string; text: string; cacheFilename: string } | null {
    const entry = this.pendingStreams.get(token);
    if (!entry) return null;
    this.pendingStreams.delete(token);
    return entry;
  }

  peekStreamToken(token: string): { sessionId: string; text: string; cacheFilename: string } | null {
    const entry = this.pendingStreams.get(token);
    if (!entry) return null;
    return entry;
  }

  async streamAudioDirect(sessionId: string, text: string, cacheFilenameHint?: string): Promise<{ stream: NodeJS.ReadableStream; format: string; cacheFilename?: string } | null> {
    if (!this.isEnabled() || this.provider !== 'fish-audio' || !this.fishAudioUrl) {
      return null;
    }

    const url = `${this.fishAudioUrl}/v1/tts`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.fishAudioApiKey) {
      headers['Authorization'] = `Bearer ${this.fishAudioApiKey}`;
    }

    const effectiveFormat = this.resolveFormatForStreaming();
    const ext = effectiveFormat === 'pcm' ? 'pcm' : effectiveFormat === 'wav' ? 'wav' : 'mp3';
    const textHash = crypto.createHash('md5').update(text).digest('hex').substring(0, 12);
    const filename = cacheFilenameHint || `${textHash}.${ext}`;
    const audioDir = path.resolve(__dirname, '..', '..', 'audio', sessionId);
    const filepath = path.join(audioDir, filename);

    // If cached file exists, serve it directly
    try {
      await fs.promises.access(filepath, fs.constants.R_OK);
      logger.info('[TTS] Serving cached audio', { filepath });
      const cachedStream = fs.createReadStream(filepath);
      return { stream: cachedStream, format: effectiveFormat, cacheFilename: filename };
    } catch {/* not cached, continue */}
    const payload = {
      text,
      reference_id: this.fishAudioVoiceId || '1',
      format: effectiveFormat,
      streaming: true,
      chunk_length: 300,
      overlap_tokens: 30,
      top_p: 0.85,
      repetition_penalty: 1.1,
      temperature: 0.85,
    };

    try {
      logger.info('[TTS] Fish Audio stream request starting', { sessionId, format: effectiveFormat, textLength: text.length });
      const startTime = Date.now();
      
      const response = await axios.post(url, payload, {
        responseType: 'stream',
        headers,
        timeout: 120000,
        decompress: false,
      });

      logger.info('[TTS] Fish Audio stream response received', {
        sessionId,
        statusCode: response.status,
        contentType: response.headers['content-type'],
        streamingSent: true,
        elapsed: Date.now() - startTime,
      });

      // Create PassThrough stream to tee to both client and disk
      const passThrough = new PassThrough();
      
      let chunkCount = 0;
      let totalBytes = 0;

      // Log chunks as they arrive from fish-audio
      response.data.on('data', (chunk: Buffer) => {
        chunkCount++;
        totalBytes += chunk.length;
        logger.info('[TTS] Fish Audio chunk received from API', {
          sessionId,
          chunkNumber: chunkCount,
          chunkSize: chunk.length,
          totalBytes,
          elapsed: Date.now() - startTime,
        });
        passThrough.write(chunk);
      });

      response.data.on('end', () => {
        logger.info('[TTS] Fish Audio stream ended from API', {
          sessionId,
          totalChunks: chunkCount,
          totalBytes,
          elapsed: Date.now() - startTime,
        });
        passThrough.end();
      });

      response.data.on('error', (err: any) => {
        logger.error('[TTS] Fish Audio stream error from API', { 
          sessionId, 
          error: err.message,
          elapsed: Date.now() - startTime,
        });
        passThrough.destroy(err);
      });

      // Write to disk for caching and replay - use content hash for deduplication
      fs.promises.mkdir(audioDir, { recursive: true }).then(() => {
        const writeStream = fs.createWriteStream(filepath);
        
        passThrough.pipe(writeStream);
        
        writeStream.on('finish', () => {
          logger.info('[TTS] Fish Audio cached to disk', { filepath, filename });
        });
        writeStream.on('error', (err: any) => {
          logger.warn('[TTS] Failed to cache audio to disk', { error: err.message });
        });
      }).catch(err => {
        logger.warn('[TTS] Failed to create audio directory', { error: err.message });
      });

      return {
        stream: passThrough,
        format: effectiveFormat,
        cacheFilename: filename,
      };
    } catch (err: any) {
      logger.error('[TTS] Fish Audio streaming request failed', { error: err.message });
      return null;
    }
  }

  async synthesize(sessionId: string, text: string): Promise<TTSAudioResult | null> {
    try {
      if (!this.isEnabled()) return null;
      if (!text || text.trim().length === 0) return null;

      // Preprocess text for better pronunciation
      const processedText = this.preprocessTextForTTS(text);

      const audioDir = path.resolve(__dirname, '..', '..', 'audio', sessionId);
      await fs.promises.mkdir(audioDir, { recursive: true });
      let ext = 'mp3';
      if (this.provider === 'fish-audio') {
        const format = this.fishAudioStreaming ? 'mp3' : this.fishAudioFormat;
        ext = format === 'pcm' ? 'pcm' : format === 'wav' ? 'wav' : 'mp3';
      }
      const filename = `${Date.now()}.${ext}`;
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
      } else if (this.provider === 'fish-audio') {
        if (!this.fishAudioUrl) {
          logger.warn('TTS provider fish-audio selected but FISH_AUDIO_BASE_URL missing');
          return null;
        }
        const url = `${this.fishAudioUrl}/v1/tts`;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (this.fishAudioApiKey) {
          headers['Authorization'] = `Bearer ${this.fishAudioApiKey}`;
        }
        const payload = {
          text: processedText,
          reference_id: this.fishAudioVoiceId || '1',
          format: this.fishAudioStreaming ? this.resolveFormatForStreaming() : this.fishAudioFormat,
          streaming: this.fishAudioStreaming,
        };
        const effectiveFormat = payload.format;
        logger.info('[TTS] Fish Audio request', { url, voiceId: this.fishAudioVoiceId, format: effectiveFormat, textLength: processedText.length, streaming: this.fishAudioStreaming, streamingSent: payload.streaming });

        if (this.fishAudioStreaming) {
          // Return a streaming proxy URL that will be handled by the backend
          const token = this.createStreamToken(sessionId, processedText);
          const publicUrl = this.toPublicUrl(`/audio/stream/${token}`);
          logger.info('[TTS] Fish Audio streaming token issued', {
            url: publicUrl,
            token,
            format: effectiveFormat,
            voiceId: this.fishAudioVoiceId,
          });
          return { url: publicUrl, provider: 'fish-audio', voiceId: this.fishAudioVoiceId };
        } else {
          // Non-streaming mode: collect entire response
          const resp = await axios.post(url, payload, {
            responseType: 'arraybuffer',
            headers,
            timeout: timeoutMs,
          });
          logger.info('[TTS] Fish Audio response', { contentType: resp.headers['content-type'], bytes: resp.data?.length });
          audioBuffer = Buffer.from(resp.data);
        }
      }

      if (!audioBuffer || audioBuffer.length === 0) {
        logger.warn('[TTS] No audio buffer returned');
        return null;
      }
      await fs.promises.writeFile(filepath, audioBuffer);
      const publicUrl = this.toPublicUrl(`/audio/${sessionId}/${filename}`);
      logger.info('TTS audio generated', { provider: this.provider, url: publicUrl });
      return { url: publicUrl, provider: this.provider!, voiceId: this.elevenVoiceId };
    } catch (err) {
      logger.warn('TTS synthesis failed:', err);
      return null;
    }
  }
}

let ttsServiceSingleton: TTSService | null = null;

export const getTTSService = (): TTSService => {
  if (!ttsServiceSingleton) {
    ttsServiceSingleton = new TTSService();
  }
  return ttsServiceSingleton;
};
