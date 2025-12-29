import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, CompletionOptions, LLMResponse } from '../types';
import { logger } from '../../utils/logger';

export class AnthropicProvider implements LLMProvider {
  name = 'Anthropic';
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-3-7-sonnet-20250219') {
    if (!apiKey) {
      throw new Error('Anthropic API key is required');
    }
    try {
      this.client = new Anthropic({ 
        apiKey: apiKey 
      });
      this.model = model;
      logger.info(`Anthropic client initialized with model: ${model}`);
    } catch (error) {
      logger.error('Failed to initialize Anthropic client:', error);
      throw error;
    }
  }

  async generateCompletion(prompt: string, options?: CompletionOptions): Promise<LLMResponse> {
    try {
      if (!this.client) {
        throw new Error('Anthropic client not initialized');
      }
      if (!this.client.messages) {
        logger.error('Anthropic client structure:', Object.keys(this.client));
        throw new Error('Anthropic client.messages is undefined - SDK may not be imported correctly');
      }
      
      const response = await this.client.messages.create({
        model: options?.model || this.model,
        max_tokens: options?.maxTokens ?? 2000,
        temperature: options?.temperature ?? 0.7,
        system: options?.systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0].type === 'text' ? response.content[0].text : '';

      return {
        content,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        model: response.model,
        finishReason: response.stop_reason || 'unknown',
      };
    } catch (error) {
      logger.error('Anthropic API error:', error);
      throw error;
    }
  }

  countTokens(text: string): number {
    // Anthropic's Claude uses a similar tokenizer to GPT
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  getMaxTokens(): number {
    const limits: Record<string, number> = {
      'claude-3-opus-20240229': 200000,
      'claude-3-sonnet-20240229': 200000,
      'claude-3-haiku-20240307': 200000,
    };
    return limits[this.model] || 200000;
  }
}
