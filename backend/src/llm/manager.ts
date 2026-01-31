import Queue from 'bull';
import { logger } from '../utils/logger';
import { LLMProvider, ProviderType, CompletionOptions, LLMResponse } from './types';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { GoogleProvider } from './providers/google';
import { XAIProvider } from './providers/xai';
import { OllamaProvider } from './providers/ollama';
import { LocalAIProvider } from './providers/localai';
import { MockProvider } from './providers/mock';

interface LLMRequest {
  prompt: string;
  options?: CompletionOptions;
  provider?: ProviderType;
}

export class LLMManager {
  private providers: Map<ProviderType, LLMProvider>;
  private requestQueue: Queue.Queue;
  private defaultProvider: ProviderType;
  private fallbackProvider?: ProviderType;
  private maxRequestsPerMinute: number;
  private requestCounts: Map<ProviderType, number[]>;

  constructor() {
    this.providers = new Map();
    this.requestCounts = new Map();
    this.maxRequestsPerMinute = parseInt(process.env.MAX_REQUESTS_PER_MINUTE || '60');
    this.defaultProvider = (process.env.DEFAULT_LLM_PROVIDER as ProviderType) || 'openai';
    this.fallbackProvider = process.env.FALLBACK_PROVIDER as ProviderType;

    // Initialize providers based on available API keys
    this.initializeProviders();

    // Initialize Bull queue for request management
    this.requestQueue = new Queue('llm-requests', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
      },
    });

    this.setupQueueProcessor();
  }

  private initializeProviders(): void {
    // Optional mock provider for local dev/testing
    if (process.env.USE_MOCK_PROVIDER === 'true') {
      this.providers.set('mock', new MockProvider());
      this.defaultProvider = 'mock';
    }
    if (process.env.OPENAI_API_KEY) {
      const model = process.env.OPENAI_DEFAULT_MODEL || process.env.DEFAULT_MODEL || 'gpt-4-turbo-preview';
      this.providers.set('openai', new OpenAIProvider(process.env.OPENAI_API_KEY, model));
      logger.info('OpenAI provider initialized');
    }

    if (process.env.ANTHROPIC_API_KEY) {
      const model = process.env.ANTHROPIC_DEFAULT_MODEL || process.env.FALLBACK_MODEL || 'claude-3-7-sonnet-20250219';
      this.providers.set('anthropic', new AnthropicProvider(process.env.ANTHROPIC_API_KEY, model));
      logger.info('Anthropic provider initialized');
    }

    if (process.env.GOOGLE_API_KEY) {
      const model = process.env.GOOGLE_DEFAULT_MODEL || 'gemini-pro';
      this.providers.set('google', new GoogleProvider(process.env.GOOGLE_API_KEY, model));
      logger.info('Google provider initialized');
    }

    if (process.env.XAI_API_KEY) {
      const model = process.env.XAI_DEFAULT_MODEL || 'grok-beta';
      this.providers.set('xai', new XAIProvider(process.env.XAI_API_KEY, model));
      logger.info('xAI provider initialized');
    }

    // Unified local LLM configuration
    const localUrl = process.env.LOCAL_LLM_BASE_URL;
    const localApi = (process.env.LOCAL_LLM_API || 'openai').toLowerCase();
    if (localUrl) {
      switch (localApi) {
        case 'ollama':
          {
            const model = process.env.OLLAMA_DEFAULT_MODEL || 'llama2';
            this.providers.set('ollama', new OllamaProvider(localUrl, model));
          }
          logger.info('Local LLM (Ollama) initialized');
          break;
        case 'openai':
        case 'localai':
        case 'openai-compatible':
          {
            const model = process.env.LOCALAI_DEFAULT_MODEL || 'gpt-3.5-turbo';
            this.providers.set('localai', new LocalAIProvider(localUrl, model));
          }
          logger.info('Local LLM (OpenAI-compatible) initialized');
          break;
        case 'llamacpp':
          // Many llama.cpp servers expose OpenAI-compatible APIs; register as 'llamacpp'
          {
            const model = process.env.LOCALAI_DEFAULT_MODEL || 'gpt-3.5-turbo';
            this.providers.set('llamacpp', new LocalAIProvider(localUrl, model));
          }
          logger.info('Local LLM (llamacpp via OpenAI-compatible) initialized');
          break;
        default:
          {
            const model = process.env.LOCALAI_DEFAULT_MODEL || 'gpt-3.5-turbo';
            this.providers.set('localai', new LocalAIProvider(localUrl, model));
          }
          logger.warn(`Unknown LOCAL_LLM_API '${localApi}'; defaulting to OpenAI-compatible`);
      }
    }

    if (this.providers.size === 0) {
      logger.warn('No LLM providers configured. Please set up API keys in environment variables.');
    }
  }

  private setupQueueProcessor(): void {
    this.requestQueue.process(async (job) => {
      const { prompt, options, provider } = job.data as LLMRequest;
      return await this.executeRequest(prompt, options, provider);
    });

    this.requestQueue.on('failed', (job, err) => {
      logger.error(`LLM request failed: ${err.message}`, { jobId: job.id });
    });
  }

  private async checkRateLimit(provider: ProviderType): Promise<boolean> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    if (!this.requestCounts.has(provider)) {
      this.requestCounts.set(provider, []);
    }

    const counts = this.requestCounts.get(provider)!;
    
    // Remove old timestamps
    const recentCounts = counts.filter(timestamp => timestamp > oneMinuteAgo);
    this.requestCounts.set(provider, recentCounts);

    // Check if we're under the limit
    if (recentCounts.length >= this.maxRequestsPerMinute) {
      logger.warn(`Rate limit reached for provider: ${provider}`);
      return false;
    }

    // Add current timestamp
    recentCounts.push(now);
    return true;
  }

  private async executeRequest(
    prompt: string, 
    options?: CompletionOptions, 
    providerType?: ProviderType
  ): Promise<LLMResponse> {
    const targetProvider = providerType || this.defaultProvider;
    const provider = this.providers.get(targetProvider);

    if (!provider) {
      throw new Error(`Provider ${targetProvider} not available`);
    }

    // Check rate limit
    const canProceed = await this.checkRateLimit(targetProvider);
    
    if (!canProceed) {
      // Try fallback provider if available
      if (this.fallbackProvider && this.fallbackProvider !== targetProvider) {
        logger.info(`Using fallback provider: ${this.fallbackProvider}`);
        return await this.executeRequest(prompt, options, this.fallbackProvider);
      }
      
      // Queue the request to retry later
      throw new Error('Rate limit exceeded and no fallback available');
    }

    try {
      const response = await provider.generateCompletion(prompt, options);
      logger.info(`LLM request completed`, {
        provider: targetProvider,
        tokensUsed: response.tokensUsed,
        model: response.model,
      });
      return response;
    } catch (error: any) {
      logger.error(`LLM request error for ${targetProvider}:`, error);
      
      // Try fallback on error
      if (this.fallbackProvider && this.fallbackProvider !== targetProvider) {
        logger.info(`Trying fallback provider: ${this.fallbackProvider}`);
        return await this.executeRequest(prompt, options, this.fallbackProvider);
      }
      // As a last resort, use mock provider if available
      if (this.providers.has('mock') && targetProvider !== 'mock') {
        logger.info('Falling back to mock provider');
        return await this.executeRequest(prompt, options, 'mock');
      }
      
      throw error;
    }
  }

  async generateCompletion(
    prompt: string, 
    options?: CompletionOptions,
    provider?: ProviderType
  ): Promise<LLMResponse> {
    // Add to queue for rate limiting and management
    const job = await this.requestQueue.add(
      { prompt, options, provider },
      {
        timeout: parseInt(process.env.REQUEST_QUEUE_TIMEOUT || '30000'),
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      }
    );

    return await job.finished();
  }

  getProvider(providerType: ProviderType): LLMProvider | undefined {
    return this.providers.get(providerType);
  }

  getAvailableProviders(): ProviderType[] {
    return Array.from(this.providers.keys());
  }

  async shutdown(): Promise<void> {
    await this.requestQueue.close();
    logger.info('LLM Manager shutdown complete');
  }
}

// Singleton instance
let llmManager: LLMManager | null = null;

export function getLLMManager(): LLMManager {
  if (!llmManager) {
    llmManager = new LLMManager();
  }
  return llmManager;
}
