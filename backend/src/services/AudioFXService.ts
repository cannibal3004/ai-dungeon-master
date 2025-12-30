import fs from 'fs';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';
import { logger } from '../utils/logger';

export interface AudioGenResult {
  url: string;
  provider: string;
  kind: 'ambience' | 'sfx';
  durationSeconds?: number;
}

/**
 * Lightweight generator for ambience beds and one-shot SFX.
 * Supports ElevenLabs sound-generation endpoint or a generic HTTP endpoint that returns audio bytes.
 */
export class AudioFXService {
  private enabled: boolean;
  private provider: 'elevenlabs' | 'http' | undefined;
  private elevenKey?: string;
  private httpUrl?: string;
  private defaultAmbienceSeconds: number;
  private defaultSfxSeconds: number;

  constructor() {
    this.enabled = (process.env.AMBIENCE_ENABLED || 'false').toLowerCase() === 'true';
    const prov = (process.env.AMBIENCE_PROVIDER || '').toLowerCase();
    this.provider = (prov === 'elevenlabs' || prov === 'http') ? (prov as any) : undefined;
    this.elevenKey = process.env.ELEVENLABS_API_KEY;
    this.httpUrl = process.env.AMBIENCE_HTTP_URL;
    this.defaultAmbienceSeconds = Number(process.env.AMBIENCE_DURATION_SECONDS || 45);
    this.defaultSfxSeconds = Number(process.env.AMBIENCE_SFX_DURATION_SECONDS || 6);
  }

  isEnabled(): boolean { return this.enabled && !!this.provider; }

  private slugify(input: string): string {
    return input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '')
      || 'ambience';
  }

  private async ensureDir(dir: string) {
    await fs.promises.mkdir(dir, { recursive: true });
  }

  private async maybeReturnCached(filepath: string, publicUrl: string): Promise<AudioGenResult | null> {
    if (fs.existsSync(filepath)) {
      return { url: publicUrl, provider: this.provider!, kind: 'ambience' };
    }
    return null;
  }

  /**
   * Generate or reuse an ambience bed (loopable-ish) for a scene key.
   */
  async synthesizeAmbience(sessionId: string, sceneKey: string, prompt: string): Promise<AudioGenResult | null> {
    if (!this.isEnabled()) return null;
    try {
      const keySlug = this.slugify(sceneKey || 'scene');
      const audioDir = path.resolve(__dirname, '..', '..', 'audio', sessionId, 'ambience');
      await this.ensureDir(audioDir);
      const filename = `${keySlug}.mp3`;
      const filepath = path.join(audioDir, filename);
      const publicUrl = `/audio/${sessionId}/ambience/${filename}`;

      const cached = await this.maybeReturnCached(filepath, publicUrl);
      if (cached) return cached;

      const buffer = await this.generateBuffer(prompt, this.defaultAmbienceSeconds, 'ambience');
      if (!buffer) return null;
      await fs.promises.writeFile(filepath, buffer);
      logger.info('Ambience audio generated', { provider: this.provider, url: publicUrl, scene: sceneKey });
      return { url: publicUrl, provider: this.provider!, kind: 'ambience', durationSeconds: this.defaultAmbienceSeconds };
    } catch (err) {
      logger.warn('Ambience synthesis failed', err);
      return null;
    }
  }

  /**
   * Generate a short SFX sting keyed to an event.
   */
  async synthesizeSfx(sessionId: string, eventKey: string, prompt: string): Promise<AudioGenResult | null> {
    if (!this.isEnabled()) return null;
    try {
      const keySlug = this.slugify(eventKey || 'sfx');
      const audioDir = path.resolve(__dirname, '..', '..', 'audio', sessionId, 'sfx');
      await this.ensureDir(audioDir);
      const filename = `${Date.now()}-${keySlug}.mp3`;
      const filepath = path.join(audioDir, filename);
      const publicUrl = `/audio/${sessionId}/sfx/${filename}`;

      const buffer = await this.generateBuffer(prompt, this.defaultSfxSeconds, 'sfx');
      if (!buffer) return null;
      await fs.promises.writeFile(filepath, buffer);
      logger.info('SFX audio generated', { provider: this.provider, url: publicUrl, event: eventKey });
      return { url: publicUrl, provider: this.provider!, kind: 'sfx', durationSeconds: this.defaultSfxSeconds };
    } catch (err) {
      logger.warn('SFX synthesis failed', err);
      return null;
    }
  }

  private async generateBuffer(prompt: string, durationSeconds: number, kind: 'ambience' | 'sfx'): Promise<Buffer | null> {
    if (!prompt || !prompt.trim()) return null;

    if (this.provider === 'elevenlabs') {
      if (!this.elevenKey) {
        logger.warn('Ambience enabled but ELEVENLABS_API_KEY missing');
        return null;
      }
      // ElevenLabs sound-generation endpoint (music/SFX). This is best-effort and may need model tweaks if their API changes.
      const url = 'https://api.elevenlabs.io/v1/sound-generation';
      const body: any = {
        text: prompt,
        duration_seconds: durationSeconds,
        // model or type hints can be provided via env; defaults are provider-side
        model_id: process.env.ELEVENLABS_SFX_MODEL_ID || undefined,
        // simple random seed for slight variation while keeping determinism per prompt if desired
        seed: parseInt(crypto.createHash('sha1').update(prompt).digest('hex').slice(0, 8), 16) % 4294967295,
      };
      const resp = await axios.post(url, body, {
        responseType: 'arraybuffer',
        headers: {
          'xi-api-key': this.elevenKey,
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
        },
        timeout: 25000,
      });
      return Buffer.from(resp.data);
    }

    if (this.provider === 'http') {
      if (!this.httpUrl) {
        logger.warn('Ambience provider http selected but AMBIENCE_HTTP_URL missing');
        return null;
      }
      const resp = await axios.post(this.httpUrl, { text: prompt, duration_seconds: durationSeconds, kind }, { responseType: 'arraybuffer', timeout: 25000 });
      return Buffer.from(resp.data);
    }

    return null;
  }
}
