export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

export interface LLMProvider {
  name: string;
  generateCompletion(prompt: string, options?: CompletionOptions): Promise<LLMResponse>;
  countTokens(text: string): number;
  getMaxTokens(): number;
}

export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  model?: string;
  systemPrompt?: string;
  tools?: Tool[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

export interface LLMResponse {
  content: string;
  tokensUsed: number;
  model: string;
  finishReason: string;
  tool_calls?: ToolCall[];
}

export interface RateLimitInfo {
  requestsPerMinute: number;
  tokensPerMinute: number;
  currentRequests: number;
  currentTokens: number;
}

export type ProviderType = 'openai' | 'anthropic' | 'xai' | 'google' | 'ollama' | 'llamacpp' | 'localai' | 'mock';
