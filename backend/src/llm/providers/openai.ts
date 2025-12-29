import OpenAI from 'openai';
import { LLMProvider, CompletionOptions, LLMResponse } from '../types';
import { encoding_for_model } from 'tiktoken';
import { logger } from '../../utils/logger';

export class OpenAIProvider implements LLMProvider {
  name = 'OpenAI';
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4-turbo-preview') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async generateCompletion(prompt: string, options?: CompletionOptions): Promise<LLMResponse> {
    try {
      const selectedModel = options?.model || this.model;

      // Helper: determine if model requires the Responses API (e.g., GPT-5 series)
      // Note: OpenAI docs recommend Responses API for all reasoning models
      const useResponsesApi = (m: string) => {
        const lower = (m || '').toLowerCase();
        // Use Responses API for all reasoning models: gpt-5*, o5*, gpt-4.1*
        return lower.startsWith('gpt-5') || lower.startsWith('o5') || lower.includes('gpt-4.1');
      };

      if (useResponsesApi(selectedModel)) {
        // Use Responses API with instructions and max_output_tokens
        // Note: GPT-5 models don't support temperature or top_p parameters
        // GPT-5 requires higher max_output_tokens to generate content
        const result = await this.client.responses.create({
          model: selectedModel,
          input: prompt,
          instructions: options?.systemPrompt,
          max_output_tokens: options?.maxTokens ?? 8000,
          reasoning: { effort: 'low' }, // Reduce reasoning overhead to save tokens
        } as any);

        // Debug: log the response structure to understand what we're getting
        logger.info('Responses API result structure:', {
          hasOutputText: !!(result as any).output_text,
          hasOutput: !!(result as any).output,
          hasText: !!(result as any).text,
          textType: typeof (result as any).text,
          textValue: JSON.stringify((result as any).text).substring(0, 200),
          outputLength: (result as any).output?.length,
          outputType: typeof (result as any).output,
          firstOutputType: (result as any).output?.[0] ? typeof (result as any).output[0] : 'none',
          keys: Object.keys(result)
        });

        // Extract content from the Responses API structure
        let content = '';
        const outputArray = (result as any).output;
        
        // First, try the output_text field if available (simplest approach)
        if ((result as any).output_text) {
          const outputText = (result as any).output_text;
          // Handle various formats: string, object, or array-like
          if (typeof outputText === 'string') {
            content = outputText;
          } else if (typeof outputText === 'object' && outputText !== null) {
            // If it's an object/array-like, check if it looks like a stringified object
            if (outputText[0] !== undefined) {
              // Array-like object, reconstruct the string
              content = Object.values(outputText).join('');
            } else {
              // Regular object, stringify it
              content = JSON.stringify(outputText);
            }
          } else {
            content = String(outputText);
          }
          logger.info('Using output_text field, type:', typeof outputText, 'converted length:', content.length, 'preview:', content.substring(0, 100));
        } else {
          logger.info('No output_text field available');
        }
        
        // If no output_text, try extracting from output array
        if (!content && outputArray && Array.isArray(outputArray)) {
          logger.info('Extracting from output array, length:', outputArray.length);
          
          // Log output structure for debugging
          logger.info('Output array items:', outputArray.map((item: any, idx: number) => ({
            index: idx,
            type: item.type,
            hasContent: !!item.content,
            hasSummary: !!item.summary,
            hasText: !!item.text,
            contentLength: item.content?.length,
            summaryLength: item.summary?.length,
            keys: Object.keys(item)
          })));
          
          // Extract content from each output item
          // For reasoning models: skip reasoning items, extract from message items
          content = outputArray
            .map((item: any) => {
              // Skip reasoning items - they contain internal thinking, not the response
              if (item.type === 'reasoning') {
                logger.info('Skipping reasoning item (internal thinking)');
                return '';
              }
              
              // If item is a message with content array
              if (item.content && Array.isArray(item.content)) {
                logger.info('Extracting from message content array, length:', item.content.length);
                return item.content
                  .map((c: any) => {
                    if (c.type === 'text' && c.text) return c.text;
                    if (typeof c === 'string') return c;
                    if (c.text) return c.text;
                    return '';
                  })
                  .join('');
              }
              // If item has text directly
              if (item.text && typeof item.text === 'string') {
                return item.text;
              }
              // If item is a string
              if (typeof item === 'string') {
                return item;
              }
              return '';
            })
            .filter((s: string) => s.length > 0)
            .join('\n');
        }

        logger.info('Final extracted content length:', content.length);
        
        // Check if response was incomplete due to token limit
        const status = (result as any).status;
        if (status === 'incomplete') {
          const reason = (result as any).incomplete_details?.reason;
          logger.warn('Response incomplete, reason:', reason);
          // Don't replace valid content with error message
          // Only add warning if no content was extracted
        }
        
        // If still empty, log the full structure for debugging
        if (!content) {
          logger.error('Failed to extract content. First output item:', outputArray && outputArray[0] ? JSON.stringify(outputArray[0]) : 'no output');
        }

        const usage: any = (result as any).usage || {};
        const tokensUsed = (usage.input_tokens || 0) + (usage.output_tokens || 0);
        const finishReason = ((result as any).output?.[0]?.finish_reason) || 'stop';

        return {
          content,
          tokensUsed,
          model: selectedModel,
          finishReason,
        };
      } else {
        // Legacy Chat Completions API
        const messages: any[] = [];

        if (options?.systemPrompt) {
          messages.push({ role: 'system', content: options.systemPrompt });
        }

        messages.push({ role: 'user', content: prompt });

        // GPT-5 models have different parameter requirements
        const isGpt5 = selectedModel.toLowerCase().includes('gpt-5');
        const completionParams: any = {
          model: selectedModel,
          messages,
        };
        
        // GPT-5 models only support default temperature/top_p
        if (!isGpt5) {
          completionParams.temperature = options?.temperature ?? 0.7;
          completionParams.top_p = options?.topP ?? 1;
        }
        
        // GPT-5 uses max_completion_tokens, older models use max_tokens
        if (isGpt5) {
          completionParams.max_completion_tokens = options?.maxTokens ?? 2000;
        } else {
          completionParams.max_tokens = options?.maxTokens ?? 2000;
        }

        // Add tools if provided
        if (options?.tools && options.tools.length > 0) {
          completionParams.tools = options.tools;
          if (options.tool_choice) {
            completionParams.tool_choice = options.tool_choice;
          }
        }

        const response = await this.client.chat.completions.create(completionParams);

        const choice = response.choices[0];
        const content = choice.message.content || '';
        const toolCalls = choice.message.tool_calls;

        logger.info('Chat Completions response:', {
          contentLength: content.length,
          contentPreview: content.substring(0, 100),
          finishReason: choice.finish_reason,
          model: response.model,
          hasToolCalls: !!toolCalls,
          toolCallsCount: toolCalls?.length || 0,
        });

        return {
          content,
          tokensUsed: response.usage?.total_tokens || 0,
          model: response.model,
          finishReason: choice.finish_reason,
          tool_calls: toolCalls?.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        };
      }
    } catch (error) {
      logger.error('OpenAI API error:', error);
      throw error;
    }
  }

  countTokens(text: string): number {
    try {
      const encoder = encoding_for_model(this.model as any);
      const tokens = encoder.encode(text);
      encoder.free();
      return tokens.length;
    } catch (error) {
      // Fallback: rough estimate
      return Math.ceil(text.length / 4);
    }
  }

  getMaxTokens(): number {
    const limits: Record<string, number> = {
      'gpt-4-turbo-preview': 128000,
      'gpt-4': 8192,
      'gpt-3.5-turbo': 16384,
      'gpt-5-mini': 1000000,
    };
    return limits[this.model] || 8192;
  }
}
