import { z } from 'zod';
import RunwayML from '@runwayml/sdk';
import LumaAI from 'lumaai'; // Import Luma AI SDK
import axios from 'axios';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { pollRunwayTask } from '../utils/polling.js';
import { pollLumaTask } from '../utils/luma-polling.js'; // Revert back to .js extension

// --- Zod Schema for Input Validation ---
const providerEnum = z.enum(['runwayml', 'lumaai']).optional().default('runwayml');

// Luma specific enums/types based on their docs
const lumaAspectRatios = z
  .enum(['16:9', '1:1', '3:4', '4:3', '9:16', '9:21', '21:9'])
  .optional()
  .default('16:9');
const lumaModels = z
  .enum(['ray-flash-2', 'ray-2', 'ray-1-6'])
  .optional()
  .default('ray-2'); // Default to Ray 2 as per docs

// Runway specific enums/types (Updated for 2024-11-06 API version)
const runwayResolutions = z.enum(['1280:768', '768:1280']).optional();

export const generateTextToVideoSchema = z.object({
  provider: providerEnum,
  promptText: z.string().min(1, 'Prompt text cannot be empty.'),
  // Runway specific (optional)
  runway_model: z.string().optional(), // e.g., "gen-2"
  runway_resolution: runwayResolutions, // Use resolution instead of ratio
  runway_watermark: z.boolean().optional().default(false),
  // Luma specific (optional)
  luma_model: lumaModels,
  luma_aspect_ratio: lumaAspectRatios,
  luma_loop: z.boolean().optional(), // Luma supports loop
  // Common (optional) - use provider defaults if not specified
  duration: z.number().int().positive().optional(), // Luma uses string like "5s", Runway uses number
  seed: z.number().int().optional(),
});

// Type alias for inferred schema type
type TextToVideoParams = z.infer<typeof generateTextToVideoSchema>;

// --- Tool Implementation ---
export async function generateTextToVideoTool(args: any, exchange: any) {
  let validatedArgs: TextToVideoParams;
  try {
    validatedArgs = generateTextToVideoSchema.parse(args);
  } catch (error: any) {
    console.error(
      `[${new Date().toISOString()}] Invalid arguments for generate_text_to_video:`,
      error.errors
    );
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid arguments: ${error.errors
        .map((e: any) => `${e.path.join('.')} - ${e.message}`)
        .join(', ')}`
    );
  }

  const {
    provider,
    promptText,
    runway_model = 'gen-2', // Default runway model
    runway_resolution, // Use resolution
    runway_watermark,
    luma_model, // Default handled by Zod
    luma_aspect_ratio, // Default handled by Zod
    luma_loop,
    duration, // Common param
    seed, // Common param
  } = validatedArgs;

  const progressToken = exchange?.progressToken; // Get progress token if available
  let taskId: string;
  let providerName: string = provider; // To use in messages

  try {
    console.log(
      `[${new Date().toISOString()}] Starting text-to-video generation via ${providerName} with prompt: "${promptText.substring(
        0,
        50
      )}..."`
    );

    /* // Commenting out non-functional RunwayML text-to-video block
    if (provider === 'runwayml') {
      // --- RunwayML Logic ---
      const apiKey = process.env.RUNWAYML_API_SECRET;
      if (!apiKey) {
        throw new McpError(
          ErrorCode.InternalError,
          'RUNWAYML_API_SECRET is not configured on the server.'
        );
      }
      const runwayClient = new RunwayML({ apiKey });

      const endpoint = 'https://api.runwayml.com/v1/text_to_video'; // Use production endpoint
      const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
      // Note: Runway duration is number (seconds), Luma is string (e.g., "5s")
      const payload: Record<string, any> = {
        prompt: promptText, // Use 'prompt' key for RunwayML API
        model: runway_model,
        duration, // Runway uses number directly
        seed,
        watermark: runway_watermark,
        resolution: runway_resolution, // Use resolution key
      };
      Object.keys(payload).forEach(
        (key) => payload[key] === undefined && delete payload[key]
      );

      const response = await axios.post(endpoint, payload, { headers });
      taskId = response.data?.id;
      if (!taskId) {
        throw new McpError(
          ErrorCode.InternalError,
          'RunwayML API did not return a task ID.'
        );
      }

      console.log(
        `[${new Date().toISOString()}] RunwayML task initiated with ID: ${taskId}`
      );

      // Start Runway polling
      pollRunwayTask({
        runwayClient,
        taskId,
        mcpExchange: exchange,
        progressToken,
      }).catch((error: any) => { // Added type annotation for error
        console.error(
          `[${new Date().toISOString()}] RunwayML polling failed for task ${taskId}:`,
          error.message || error
        );
      });
      // --- End RunwayML Logic ---
    }
    */ // End of commented out block
    if (provider === 'lumaai') { // Changed 'else if' to 'if'
      // --- Luma AI Logic ---
      const apiKey = process.env.LUMAAI_API_KEY;
      if (!apiKey) {
        throw new McpError(
          ErrorCode.InternalError,
          'LUMAAI_API_KEY is not configured on the server.'
        );
      }
      const lumaClient = new LumaAI({ authToken: apiKey });

      // Luma uses duration as string like "5s"
      const lumaDuration = duration ? `${duration}s` : undefined;

      // Build Luma payload carefully, only adding defined values
      const lumaPayload: LumaAI.GenerationCreateParams = {
        prompt: promptText, // Prompt is required
      };
      // Conditionally add optional properties ONLY if they are defined
      if (luma_model !== undefined) {
        lumaPayload.model = luma_model;
      }
      if (luma_aspect_ratio !== undefined) {
        lumaPayload.aspect_ratio = luma_aspect_ratio;
      }
      if (luma_loop !== undefined) {
        lumaPayload.loop = luma_loop;
      }
      // Ensure lumaDuration is a string before assigning
      const finalLumaDuration = duration ? `${duration}s` : undefined;
      if (finalLumaDuration !== undefined) {
         lumaPayload.duration = finalLumaDuration;
      }
      // Add seed if Luma supports it and it's provided
      // if (seed !== undefined) lumaPayload.seed = seed; // Uncomment if Luma adds seed support

      const generation = await lumaClient.generations.create(lumaPayload);
      taskId = generation.id || ''; // Ensure taskId is a string

      if (!taskId) {
        throw new McpError(
          ErrorCode.InternalError,
          'Luma AI API did not return a generation ID.'
        );
      }

      console.log(
        `[${new Date().toISOString()}] Luma AI task initiated with ID: ${taskId}`
      );

      // Start Luma polling
      pollLumaTask({
        lumaClient,
        generationId: taskId,
        mcpExchange: exchange,
        progressToken,
      }).catch((error: any) => { // Added type annotation for error
        console.error(
          `[${new Date().toISOString()}] Luma AI polling failed for task ${taskId}:`,
          error.message || error
        );
      });
      // --- End Luma AI Logic ---
    } else {
      // Should not happen due to Zod validation, but good practice
      throw new McpError(ErrorCode.InvalidParams, `Invalid provider: ${provider}`);
    }

    // Send initial confirmation back to the client (common for both)
    exchange.sendProgress?.({
      token: progressToken,
      value: { status: 'INITIATED', taskId, provider: providerName },
    });

    // Return immediately after initiating the task and polling
    return {
      content: [
        {
          type: 'text',
          text: `${providerName} text-to-video task initiated with ID: ${taskId}. Generation is in progress. Status updates will follow.`,
        },
      ],
    };
  } catch (error: any) {
    console.error(
      `[${new Date().toISOString()}] Error initiating ${providerName} text-to-video task:`,
      error
    );

    // Handle specific API errors if possible, otherwise general internal error
    if (provider === 'runwayml' && axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message =
        error.response?.data?.message || error.message || 'Unknown Axios error';
      let mcpErrorCode = ErrorCode.InternalError;
      if (status === 401 || status === 403) mcpErrorCode = ErrorCode.InvalidRequest;
      else if (status === 400 || status === 422) mcpErrorCode = ErrorCode.InvalidParams;
      throw new McpError(
        mcpErrorCode,
        `RunwayML API Error: ${message} (Status: ${status || 'N/A'})`
      );
    } else if (provider === 'lumaai' && error instanceof LumaAI.APIError) {
      let mcpErrorCode = ErrorCode.InternalError;
      if (error.status === 401 || error.status === 403) mcpErrorCode = ErrorCode.InvalidRequest;
      else if (error.status === 400 || error.status === 422) mcpErrorCode = ErrorCode.InvalidParams;
      throw new McpError(
        mcpErrorCode,
        `Luma AI API Error: ${error.message} (Status: ${error.status})`
      );
    }

    // General fallback error
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to initiate ${providerName} text-to-video task: ${error.message}`
    );
  }
}
