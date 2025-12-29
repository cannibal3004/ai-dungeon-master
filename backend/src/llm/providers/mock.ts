import { LLMProvider, CompletionOptions, LLMResponse } from '../types';

export class MockProvider implements LLMProvider {
  name = 'Mock';
  private model: string;

  constructor(model: string = 'mock-1') {
    this.model = model;
  }

  async generateCompletion(prompt: string, options?: CompletionOptions): Promise<LLMResponse> {
    const sys = options?.systemPrompt ? `[System]\n${options.systemPrompt}\n\n` : '';
    const content = `${sys}DM responds: ${prompt.substring(0, 800)}`;
    return {
      content,
      tokensUsed: this.countTokens(content),
      model: this.model,
      finishReason: 'stop',
    };
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  getMaxTokens(): number {
    return 4096;
  }
}
