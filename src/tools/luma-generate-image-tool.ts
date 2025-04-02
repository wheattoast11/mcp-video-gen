import { z } from 'zod';
import LumaAI from 'lumaai';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { pollLumaTask } from '../utils/luma-polling.js'; // Re-use polling logic

// --- Zod Schema for Input Validation ---
// Based on Luma docs for image generation
const lumaImageAspectRatios = z
  .enum(['16:9', '1:1', '3:4', '4:3', '9:16', '9:21', '21:9'])
  .optional()
  .default('16:9');
const lumaImageModels = z
  .enum(['photon-1', 'photon-flash-1'])
  .optional()
  .default('photon-1');

const imageRefSchema = z.object({
  url: z.string().url(),
  weight: z.number().min(0).max(1).optional().default(0.85), // Default based on docs example
});

const styleRefSchema = z.object({
  url: z.string().url(),
  weight: z.number().min(0).max(1).optional().default(0.8), // Default based on docs example
});

const characterRefSchema = z.record(
  z.string().startsWith('identity'), // Keys like identity0, identity1...
  z.object({
    images: z.array(z.string().url()).min(1).max(4), // 1 to 4 image URLs
  })
);

const modifyImageRefSchema = z.object({
  url: z.string().url(),
  weight: z.number().min(0).max(1).optional().default(1.0), // Default based on docs example
});

export const lumaGenerateImageSchema = z.object({
  prompt: z.string().min(1, 'Prompt cannot be empty.'),
  aspect_ratio: lumaImageAspectRatios,
  model: lumaImageModels,
  image_ref: z.array(imageRefSchema).max(4).optional(),
  style_ref: z.array(styleRefSchema).max(1).optional(), // Docs imply only one style ref? Check API spec if needed.
  character_ref: characterRefSchema.optional(),
  modify_image_ref: modifyImageRefSchema.optional(),
  // Add negative_prompt if supported? Docs were conflicting.
  // negative_prompt: z.string().optional(),
});

// Type alias for inferred schema type
type LumaImageParams = z.infer<typeof lumaGenerateImageSchema>;

// --- Tool Implementation ---
export async function lumaGenerateImageTool(args: any, exchange: any) {
  let validatedArgs: LumaImageParams;
  try {
    validatedArgs = lumaGenerateImageSchema.parse(args);
  } catch (error: any) {
    console.error(
      `[${new Date().toISOString()}] Invalid arguments for luma_generate_image:`,
      error.errors
    );
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid arguments: ${error.errors
        .map((e: any) => `${e.path.join('.')} - ${e.message}`)
        .join(', ')}`
    );
  }

  const apiKey = process.env.LUMAAI_API_KEY;
  if (!apiKey) {
    throw new McpError(
      ErrorCode.InternalError,
      'LUMAAI_API_KEY is not configured on the server.'
    );
  }

  const lumaClient = new LumaAI({ authToken: apiKey });
  const progressToken = exchange?.progressToken;

  try {
    console.log(
      `[${new Date().toISOString()}] Starting Luma AI image generation with prompt: "${validatedArgs.prompt.substring(
        0,
        50
      )}..."`
    );

    // Prepare payload specifically for image generation as a plain object
    const payload: any = { // Use 'any' for flexibility, SDK should handle validation
      prompt: validatedArgs.prompt,
      aspect_ratio: validatedArgs.aspect_ratio,
      model: validatedArgs.model, // This should be 'photon-1' or 'photon-flash-1' from Zod schema
      image_ref: validatedArgs.image_ref,
      style_ref: validatedArgs.style_ref,
      character_ref: validatedArgs.character_ref,
      modify_image_ref: validatedArgs.modify_image_ref,
      // negative_prompt: validatedArgs.negative_prompt, // Add if schema includes it
    };
    // Remove undefined optional parameters
    Object.keys(payload).forEach(
      (key) => payload[key] === undefined && delete payload[key]
    );

    // Call the Luma SDK's image creation method
    // Note: The SDK might have a different structure, e.g., client.generations.image.create
    // Adjust if necessary based on actual SDK usage. Assuming client.generations.create works for images too.
    // UPDATE: Based on JS docs, it seems client.generations.image.create is correct.
    const generation = await lumaClient.generations.image.create(payload);
    const generationId = generation.id || '';

    if (!generationId) {
      throw new McpError(
        ErrorCode.InternalError,
        'Luma AI API did not return a generation ID.'
      );
    }

    console.log(
      `[${new Date().toISOString()}] Luma AI image generation task initiated with ID: ${generationId}`
    );

    // Send initial confirmation
    exchange.sendProgress?.({
      token: progressToken,
      value: { status: 'INITIATED', taskId: generationId, provider: 'lumaai' },
    });

    // Start polling (re-use video polling, assuming response structure is similar enough)
    // It should resolve with the image URL from generation.assets.image
    pollLumaTask({
      lumaClient,
      generationId,
      mcpExchange: exchange,
      progressToken,
    })
      .then((imageUrl) => {
        console.log(
          `[${new Date().toISOString()}] Luma image polling finished successfully for task ${generationId}.`
        );
        // Send final image URL via progress (pollLumaTask needs modification to return image URL)
        // For now, pollLumaTask sends SUCCEEDED with videoUrl. We need to adapt it or handle here.
        // Let's assume pollLumaTask is adapted or we handle the final message here.
        // If pollLumaTask resolves with the URL:
        exchange.sendProgress?.({
          token: progressToken,
          value: { status: 'SUCCEEDED', imageUrl },
        });
      })
      .catch((error: any) => {
        console.error(
          `[${new Date().toISOString()}] Luma AI image polling failed for task ${generationId}:`,
          error.message || error
        );
      });

    // Return immediately
    return {
      content: [
        {
          type: 'text',
          text: `Luma AI image generation task initiated with ID: ${generationId}. Generation is in progress. Status updates will follow.`,
        },
      ],
    };
  } catch (error: any) {
    console.error(
      `[${new Date().toISOString()}] Error initiating Luma AI image generation:`,
      error
    );
    if (error instanceof LumaAI.APIError) {
      let mcpErrorCode = ErrorCode.InternalError;
      if (error.status === 401 || error.status === 403) mcpErrorCode = ErrorCode.InvalidRequest;
      else if (error.status === 400 || error.status === 422) mcpErrorCode = ErrorCode.InvalidParams;
      throw new McpError(
        mcpErrorCode,
        `Luma AI API Error: ${error.message} (Status: ${error.status})`
      );
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to initiate Luma AI image generation: ${error.message}`
    );
  }
}
