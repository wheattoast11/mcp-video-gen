import { z } from 'zod';
import RunwayML from '@runwayml/sdk';
import LumaAI from 'lumaai'; // Import Luma AI SDK
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { pollRunwayTask } from '../utils/polling.js';
import { pollLumaTask } from '../utils/luma-polling.js';

// --- Zod Schema for Input Validation ---
const providerEnum = z.enum(['runwayml', 'lumaai']).optional().default('runwayml');

// Runway specific enums/types
const runwayModels = z.enum(['gen3a_turbo']).optional();
const runwayDurations = z.enum(['5', '10']).optional().default('5').transform(Number);
const runwayRatios = z.enum(['1280:768', '768:1280']).optional();

// Luma specific enums/types
const lumaAspectRatios = z
  .enum(['16:9', '1:1', '3:4', '4:3', '9:16', '9:21', '21:9'])
  .optional()
  .default('16:9');
const lumaModels = z
  .enum(['ray-flash-2', 'ray-2', 'ray-1-6'])
  .optional()
  .default('ray-2');

// Schema for Runway's promptImage array format
const runwayImagePositionSchema = z.object({
  uri: z.string().url(),
  position: z.enum(['first', 'last']),
});

export const generateImageToVideoSchema = z.object({
  provider: providerEnum,
  // Allow single URL string or array of 1-2 image position objects for Runway
  promptImage: z.union([
    z.string().url(),
    z.array(runwayImagePositionSchema).min(1).max(2),
  ]),
  promptText: z.string().optional(), // Common optional param
  // Runway specific (optional)
  runway_model: runwayModels,
  runway_duration: runwayDurations,
  runway_ratio: runwayRatios,
  runway_watermark: z.boolean().optional().default(false),
  // Luma specific (optional)
  luma_model: lumaModels,
  luma_aspect_ratio: lumaAspectRatios,
  luma_loop: z.boolean().optional(),
  // Common (optional)
  seed: z.number().int().optional(),
  // Note: Duration is handled differently (Runway: number 5/10, Luma: string "5s")
  // We'll handle duration mapping within the tool logic if needed, or require provider-specific duration
});

// Type alias for inferred schema type
type ImageToVideoParams = z.infer<typeof generateImageToVideoSchema>;

// --- Tool Implementation ---
export async function generateImageToVideoTool(args: any, exchange: any) {
  let validatedArgs: ImageToVideoParams;
  try {
    validatedArgs = generateImageToVideoSchema.parse(args);
  } catch (error: any) {
    console.error(
      `[${new Date().toISOString()}] Invalid arguments for generate_image_to_video:`,
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
    promptImage,
    promptText,
    runway_model = 'gen3a_turbo', // Default runway model
    runway_duration, // Default handled by Zod
    runway_ratio,
    runway_watermark,
    luma_model, // Default handled by Zod
    luma_aspect_ratio, // Default handled by Zod
    luma_loop,
    seed, // Common param
  } = validatedArgs;

  const progressToken = exchange?.progressToken;
  let taskId: string;
  let providerName: string = provider;

  try {
    console.log(
      `[${new Date().toISOString()}] Starting image-to-video generation via ${providerName} with image: "${promptImage}"`
    );

    if (provider === 'runwayml') {
      // --- RunwayML Logic ---
      const apiKey = process.env.RUNWAYML_API_SECRET;
      if (!apiKey) {
        throw new McpError(
          ErrorCode.InternalError,
          'RUNWAYML_API_SECRET is not configured.'
        );
      }
      const runwayClient = new RunwayML({ apiKey });

      // Prepare Runway params, handling the flexible promptImage format
      const runwayParams: RunwayML.ImageToVideoCreateParams = {
        promptImage: validatedArgs.promptImage, // Pass the validated union type directly
        promptText,
        model: runway_model,
        duration: runway_duration as 5 | 10 | undefined, // Cast to expected type
        seed,
        watermark: runway_watermark,
        ratio: runway_ratio as '1280:768' | '768:1280' | undefined, // Cast to expected type
      };
      // Remove undefined optional parameters
      Object.keys(runwayParams).forEach((key) => {
        if (
          runwayParams[key as keyof RunwayML.ImageToVideoCreateParams] ===
          undefined
        ) {
          delete runwayParams[key as keyof RunwayML.ImageToVideoCreateParams];
        }
      });

      const task = await runwayClient.imageToVideo.create(runwayParams);
      taskId = task.id;

      console.log(
        `[${new Date().toISOString()}] RunwayML task initiated with ID: ${taskId}`
      );

      // Start Runway polling
      pollRunwayTask({
        runwayClient,
        taskId,
        mcpExchange: exchange,
        progressToken,
      }).catch((error: any) => {
        console.error(
          `[${new Date().toISOString()}] RunwayML polling failed for task ${taskId}:`,
          error.message || error
        );
      });
      // --- End RunwayML Logic ---
    } else if (provider === 'lumaai') {
      // --- Luma AI Logic ---
      const apiKey = process.env.LUMAAI_API_KEY;
      if (!apiKey) {
        throw new McpError(
          ErrorCode.InternalError,
          'LUMAAI_API_KEY is not configured.'
        );
      }
      const lumaClient = new LumaAI({ authToken: apiKey });

      // Determine the input image URL for Luma, handling the union type
      let lumaInputImageUrl: string;
      if (typeof promptImage === 'string') {
        lumaInputImageUrl = promptImage;
      } else if (Array.isArray(promptImage) && promptImage.length > 0) {
        // If it's the Runway array format, use the first image's URI for Luma
        lumaInputImageUrl = promptImage[0].uri;
        console.warn(`[${new Date().toISOString()}] Luma AI image-to-video using first image URI from array input: ${lumaInputImageUrl}`);
      } else {
        // Should not happen due to validation, but handle defensively
        throw new McpError(ErrorCode.InvalidParams, 'Invalid promptImage format for Luma AI.');
      }

      // Luma uses keyframes for image input
      const lumaPayload: LumaAI.GenerationCreateParams = {
        prompt: promptText || '', // Luma requires a prompt, even if empty for image-to-video
        model: luma_model,
        aspect_ratio: luma_aspect_ratio,
        loop: luma_loop,
        keyframes: {
          frame0: {
            type: 'image',
            url: lumaInputImageUrl, // Use the determined URL
          },
        },
        // Luma doesn't seem to have duration/seed/watermark for image-to-video?
      };
      // Remove undefined optional parameters
      Object.keys(lumaPayload).forEach(
        (key) =>
          lumaPayload[key as keyof LumaAI.GenerationCreateParams] === undefined &&
          delete lumaPayload[key as keyof LumaAI.GenerationCreateParams]
      );

      const generation = await lumaClient.generations.create(lumaPayload);
      taskId = generation.id || '';

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
      }).catch((error: any) => {
        console.error(
          `[${new Date().toISOString()}] Luma AI polling failed for task ${taskId}:`,
          error.message || error
        );
      });
      // --- End Luma AI Logic ---
    } else {
      throw new McpError(ErrorCode.InvalidParams, `Invalid provider: ${provider}`);
    }

    // Send initial confirmation (common)
    exchange.sendProgress?.({
      token: progressToken,
      value: { status: 'INITIATED', taskId, provider: providerName },
    });

    // Return immediately (common)
    return {
      content: [
        {
          type: 'text',
          text: `${providerName} image-to-video task initiated with ID: ${taskId}. Generation is in progress. Status updates will follow.`,
        },
      ],
    };
  } catch (error: any) {
    console.error(
      `[${new Date().toISOString()}] Error initiating ${providerName} image-to-video task:`,
      error
    );

    // Handle specific API errors
    if (provider === 'runwayml' && error instanceof RunwayML.APIError) {
      let mcpErrorCode = ErrorCode.InternalError;
      if (error.status === 401 || error.status === 403) mcpErrorCode = ErrorCode.InvalidRequest;
      else if (error.status === 400 || error.status === 422) mcpErrorCode = ErrorCode.InvalidParams;
      throw new McpError(
        mcpErrorCode,
        `RunwayML API Error: ${error.message} (Status: ${error.status})`
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

    // General fallback
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to initiate ${providerName} image-to-video task: ${error.message}`
    );
  }
}
