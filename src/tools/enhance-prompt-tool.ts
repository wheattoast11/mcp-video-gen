import { z } from 'zod';
import axios from 'axios';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// --- Zod Schema for Input Validation ---
export const enhancePromptSchema = z.object({
  promptText: z.string().min(1, 'Prompt text cannot be empty.'),
  useCase: z.string().optional(),
  // Consider adding model selection if desired
  // model: z.string().optional().default('anthropic/claude-3-haiku'),
});

// Type alias for inferred schema type
type EnhancePromptParams = z.infer<typeof enhancePromptSchema>;

// --- Tool Implementation ---
export async function enhancePromptTool(args: any, exchange: any) {
  let validatedArgs: EnhancePromptParams;
  try {
    validatedArgs = enhancePromptSchema.parse(args);
  } catch (error: any) {
    console.error(
      `[${new Date().toISOString()}] Invalid arguments for enhance_prompt:`,
      error.errors
    );
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid arguments: ${error.errors
        .map((e: any) => `${e.path.join('.')} - ${e.message}`)
        .join(', ')}`
    );
  }

  const { promptText, useCase } = validatedArgs;
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;

  if (!openRouterApiKey) {
    throw new McpError(
      ErrorCode.InternalError,
      'OPENROUTER_API_KEY is not configured on the server.'
    );
  }

  // --- Call OpenRouter API ---
  const openRouterEndpoint = 'https://openrouter.ai/api/v1/chat/completions';
  const headers = {
    Authorization: `Bearer ${openRouterApiKey}`,
    'Content-Type': 'application/json',
    // Optional: Add Referer and X-Title headers if needed by OpenRouter
    // 'HTTP-Referer': 'YOUR_SITE_URL',
    // 'X-Title': 'RunwayMCPPromptEnhancer',
  };

  // Choose a suitable model on OpenRouter (e.g., Haiku for speed/cost)
  const model = 'anthropic/claude-3-haiku'; // Or make this configurable

  const systemPrompt = `You are an expert prompt engineer specializing in text-to-video generation. Enhance the following user prompt to make it more descriptive, evocative, and likely to produce a high-quality, coherent video with RunwayML. Focus on visual details, camera movement suggestions (subtle pan, slow zoom in, static shot), mood, and style. ${
    useCase ? `Keep the following use case in mind: ${useCase}.` : ''
  } Output ONLY the enhanced prompt text, without any preamble or explanation.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: promptText },
  ];

  try {
    console.log(
      `[${new Date().toISOString()}] Sending prompt to OpenRouter (${model}) for enhancement: "${promptText.substring(
        0,
        50
      )}..."`
    );

    const response = await axios.post(
      openRouterEndpoint,
      {
        model: model,
        messages: messages,
        max_tokens: 500, // Limit output length
        temperature: 0.7, // Allow some creativity
      },
      { headers }
    );

    const enhancedPrompt = response.data?.choices?.[0]?.message?.content?.trim();

    if (!enhancedPrompt) {
      console.error(
        `[${new Date().toISOString()}] Failed to get enhanced prompt from OpenRouter response. Response data:`,
        response.data
      );
      throw new McpError(
        ErrorCode.InternalError,
        'OpenRouter API did not return an enhanced prompt.'
      );
    }

    console.log(
      `[${new Date().toISOString()}] Prompt enhanced successfully.`
    );

    // Return the enhanced prompt
    return {
      content: [
        {
          type: 'text',
          text: enhancedPrompt, // Return just the text content
        },
      ],
      // Optionally add metadata about the enhancement process
      // metadata: {
      //   originalPrompt: promptText,
      //   modelUsed: model,
      // }
    };
  } catch (error: any) {
    console.error(
      `[${new Date().toISOString()}] Error calling OpenRouter API:`,
      error
    );
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message =
        error.response?.data?.error?.message || // OpenRouter error structure
        error.message ||
        'Unknown Axios error';
      let mcpErrorCode = ErrorCode.InternalError;
      if (status === 401 || status === 403) {
        mcpErrorCode = ErrorCode.InvalidRequest; // Map auth errors
      } else if (status === 400 || status === 422) {
        mcpErrorCode = ErrorCode.InvalidParams; // Map bad request errors
      } else if (status === 429) {
        mcpErrorCode = ErrorCode.InternalError; // Map rate limit errors to InternalError
      }
      throw new McpError(
        mcpErrorCode,
        `OpenRouter API Error: ${message} (Status: ${status || 'N/A'})`
      );
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to enhance prompt via OpenRouter: ${error.message}`
    );
  }
}
