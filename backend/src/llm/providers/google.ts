import { GoogleGenerativeAI } from '@google/generative-ai';
import { LLMProvider, CompletionOptions, LLMResponse } from '../types';
import { logger } from '../../utils/logger';

export class GoogleProvider implements LLMProvider {
  name = 'Google';
  private client: GoogleGenerativeAI;
  private model: string;

  constructor(apiKey: string, model: string = 'gemini-pro') {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  async generateCompletion(prompt: string, options?: CompletionOptions): Promise<LLMResponse> {
    try {
      const model = this.client.getGenerativeModel({ 
        model: options?.model || this.model,
      });

      const fullPrompt = options?.systemPrompt 
        ? `${options.systemPrompt}\n\n${prompt}` 
        : prompt;

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: options?.temperature ?? 0.7,
          maxOutputTokens: options?.maxTokens ?? 2000,
          topP: options?.topP ?? 1,
        },
      });

      const response = result.response;
      const content = response.text();

      return {
        content,
        tokensUsed: 0, // Google API usage metadata not available in response
        model: this.model,
        finishReason: 'stop',
      };
    } catch (error) {
      logger.error('Google API error:', error);
      throw error;
    }
  }

  countTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  getMaxTokens(): number {
    const limits: Record<string, number> = {
      'gemini-pro': 32768,
      'gemini-1.5-pro': 1048576,
    };
    return limits[this.model] || 32768;
  }
}
