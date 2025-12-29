import axios from 'axios';
import { LLMProvider, CompletionOptions, LLMResponse } from '../types';
import { logger } from '../../utils/logger';

export class XAIProvider implements LLMProvider {
  name = 'xAI';
  private apiKey: string;
  private model: string;
  private baseURL: string;

  constructor(apiKey: string, model: string = 'grok-beta') {
    this.apiKey = apiKey;
    this.model = model;
    this.baseURL = 'https://api.x.ai/v1';
  }

  async generateCompletion(prompt: string, options?: CompletionOptions): Promise<LLMResponse> {
    try {
      const messages: any[] = [];
      
      if (options?.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }
      
      messages.push({ role: 'user', content: prompt });

      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model: options?.model || this.model,
          messages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 2000,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = response.data;

      return {
        content: data.choices[0].message.content || '',
        tokensUsed: data.usage?.total_tokens || 0,
        model: data.model,
        finishReason: data.choices[0].finish_reason,
      };
    } catch (error) {
      logger.error('xAI API error:', error);
      throw error;
    }
  }

  countTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  getMaxTokens(): number {
    return 131072; // Grok's context window
  }
}
