import axios from 'axios';
import { LLMProvider, CompletionOptions, LLMResponse } from '../types';
import { logger } from '../../utils/logger';

export class OllamaProvider implements LLMProvider {
  name = 'Ollama';
  private baseURL: string;
  private model: string;

  constructor(baseURL: string = 'http://localhost:11434', model: string = 'llama2') {
    this.baseURL = baseURL;
    this.model = model;
  }

  async generateCompletion(prompt: string, options?: CompletionOptions): Promise<LLMResponse> {
    try {
      const fullPrompt = options?.systemPrompt 
        ? `${options.systemPrompt}\n\n${prompt}` 
        : prompt;

      const response = await axios.post(
        `${this.baseURL}/api/generate`,
        {
          model: options?.model || this.model,
          prompt: fullPrompt,
          stream: false,
          options: {
            temperature: options?.temperature ?? 0.7,
            num_predict: options?.maxTokens ?? 2000,
            top_p: options?.topP ?? 1,
          },
        }
      );

      const data = response.data;

      return {
        content: data.response || '',
        tokensUsed: data.prompt_eval_count + data.eval_count || 0,
        model: this.model,
        finishReason: 'stop',
      };
    } catch (error) {
      logger.error('Ollama API error:', error);
      throw error;
    }
  }

  countTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  getMaxTokens(): number {
    // Default context window for most Ollama models
    return 4096;
  }
}
