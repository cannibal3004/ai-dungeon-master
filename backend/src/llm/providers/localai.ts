import axios from 'axios';
import { LLMProvider, CompletionOptions, LLMResponse } from '../types';
import { logger } from '../../utils/logger';

export class LocalAIProvider implements LLMProvider {
  name = 'LocalAI';
  private baseURL: string;
  private model: string;

  constructor(baseURL: string = 'http://localhost:8080', model: string = 'gpt-3.5-turbo') {
    this.baseURL = baseURL;
    this.model = model;
  }

  async generateCompletion(prompt: string, options?: CompletionOptions): Promise<LLMResponse> {
    try {
      const messages: any[] = [];
      
      if (options?.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }
      
      messages.push({ role: 'user', content: prompt });

      const response = await axios.post(
        `${this.baseURL}/v1/chat/completions`,
        {
          model: options?.model || this.model,
          messages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 2000,
        }
      );

      const data = response.data;

      return {
        content: data.choices[0].message.content || '',
        tokensUsed: data.usage?.total_tokens || 0,
        model: this.model,
        finishReason: data.choices[0].finish_reason,
      };
    } catch (error) {
      logger.error('LocalAI API error:', error);
      throw error;
    }
  }

  countTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  getMaxTokens(): number {
    return 4096; // Default, can be configured based on loaded model
  }
}
