import { z } from 'zod';
import LumaAI from 'lumaai';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { pollLumaTask } from '../utils/luma-polling.js'; // Import polling for upscale

// --- Schemas ---

export const lumaListGenerationsSchema = z.object({
  limit: z.number().int().positive().optional().default(10),
  offset: z.number().int().nonnegative().optional().default(0),
});

export const lumaGetGenerationSchema = z.object({
  generation_id: z.string().uuid('Invalid Generation ID format.'),
});

export const lumaDeleteGenerationSchema = z.object({
  generation_id: z.string().uuid('Invalid Generation ID format.'),
});

export const lumaGetCameraMotionsSchema = z.object({}); // No parameters needed

// Schema for Add Audio
export const lumaAddAudioSchema = z.object({
  generation_id: z.string().uuid('Invalid Generation ID format.'),
  prompt: z.string().min(1, 'Audio prompt cannot be empty.'),
  negative_prompt: z.string().optional(),
  // callback_url: z.string().url().optional(), // Callback not handled in this simple version
});

// Schema for Upscale
// Need to confirm valid resolution values from Luma docs/SDK if possible
const lumaUpscaleResolutions = z.enum(['1080p', '4k']).optional().default('1080p'); // Example values

export const lumaUpscaleSchema = z.object({
  generation_id: z.string().uuid('Invalid Generation ID format.'),
  resolution: lumaUpscaleResolutions,
  // callback_url: z.string().url().optional(), // Callback not handled
});


// --- Tool Implementations ---

// List Generations
export async function lumaListGenerationsTool(args: any, exchange: any) {
  let validatedArgs: z.infer<typeof lumaListGenerationsSchema>;
  try {
    validatedArgs = lumaListGenerationsSchema.parse(args);
  } catch (error: any) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid arguments: ${error.errors.map((e: any) => e.message).join(', ')}`
    );
  }

  const apiKey = process.env.LUMAAI_API_KEY;
  if (!apiKey) {
    throw new McpError(ErrorCode.InternalError, 'LUMAAI_API_KEY is not configured.');
  }
  const lumaClient = new LumaAI({ authToken: apiKey });

  try {
    console.log(
      `[${new Date().toISOString()}] Listing Luma generations (limit: ${
        validatedArgs.limit
      }, offset: ${validatedArgs.offset})`
    );
    const generations = await lumaClient.generations.list(validatedArgs);
    return {
      content: [{ type: 'text', text: JSON.stringify(generations, null, 2) }],
    };
  } catch (error: any) {
    console.error('[Luma List Generations Error]', error);
    if (error instanceof LumaAI.APIError) {
      throw new McpError(ErrorCode.InternalError, `Luma API Error: ${error.message}`);
    }
    throw new McpError(ErrorCode.InternalError, `Failed to list Luma generations: ${error.message}`);
  }
}

// Get Generation
export async function lumaGetGenerationTool(args: any, exchange: any) {
  let validatedArgs: z.infer<typeof lumaGetGenerationSchema>;
  try {
    validatedArgs = lumaGetGenerationSchema.parse(args);
  } catch (error: any) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid arguments: ${error.errors.map((e: any) => e.message).join(', ')}`
    );
  }

  const apiKey = process.env.LUMAAI_API_KEY;
  if (!apiKey) {
    throw new McpError(ErrorCode.InternalError, 'LUMAAI_API_KEY is not configured.');
  }
  const lumaClient = new LumaAI({ authToken: apiKey });

  try {
    console.log(`[${new Date().toISOString()}] Getting Luma generation: ${validatedArgs.generation_id}`);
    const generation = await lumaClient.generations.get(validatedArgs.generation_id);
    return {
      content: [{ type: 'text', text: JSON.stringify(generation, null, 2) }],
    };
  } catch (error: any) {
    console.error('[Luma Get Generation Error]', error);
    if (error instanceof LumaAI.APIError) {
       if (error.status === 404) {
         throw new McpError(ErrorCode.InvalidRequest, `Luma generation ID ${validatedArgs.generation_id} not found.`); // Use InvalidRequest for 404
       }
      throw new McpError(ErrorCode.InternalError, `Luma API Error: ${error.message}`);
    }
    throw new McpError(ErrorCode.InternalError, `Failed to get Luma generation: ${error.message}`);
  }
}

// Delete Generation
export async function lumaDeleteGenerationTool(args: any, exchange: any) {
  let validatedArgs: z.infer<typeof lumaDeleteGenerationSchema>;
  try {
    validatedArgs = lumaDeleteGenerationSchema.parse(args);
  } catch (error: any) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid arguments: ${error.errors.map((e: any) => e.message).join(', ')}`
    );
  }

  const apiKey = process.env.LUMAAI_API_KEY;
  if (!apiKey) {
    throw new McpError(ErrorCode.InternalError, 'LUMAAI_API_KEY is not configured.');
  }
  const lumaClient = new LumaAI({ authToken: apiKey });

  try {
    console.log(`[${new Date().toISOString()}] Deleting Luma generation: ${validatedArgs.generation_id}`);
    await lumaClient.generations.delete(validatedArgs.generation_id);
    return {
      content: [{ type: 'text', text: `Luma generation ${validatedArgs.generation_id} deleted successfully.` }],
    };
  } catch (error: any) {
    console.error('[Luma Delete Generation Error]', error);
     if (error instanceof LumaAI.APIError) {
       if (error.status === 404) {
         throw new McpError(ErrorCode.InvalidRequest, `Luma generation ID ${validatedArgs.generation_id} not found.`); // Use InvalidRequest for 404
       }
      throw new McpError(ErrorCode.InternalError, `Luma API Error: ${error.message}`);
    }
    throw new McpError(ErrorCode.InternalError, `Failed to delete Luma generation: ${error.message}`);
  }
}

// Get Camera Motions
export async function lumaGetCameraMotionsTool(args: any, exchange: any) {
  // No validation needed as there are no args
  const apiKey = process.env.LUMAAI_API_KEY;
  if (!apiKey) {
    throw new McpError(ErrorCode.InternalError, 'LUMAAI_API_KEY is not configured.');
  }
  const lumaClient = new LumaAI({ authToken: apiKey });

  try {
    console.log(`[${new Date().toISOString()}] Getting Luma camera motions`);
    const motions = await lumaClient.generations.cameraMotion.list();
    return {
      content: [{ type: 'text', text: JSON.stringify(motions, null, 2) }],
    };
  } catch (error: any) {
    console.error('[Luma Get Camera Motions Error]', error);
     if (error instanceof LumaAI.APIError) {
      throw new McpError(ErrorCode.InternalError, `Luma API Error: ${error.message}`);
    }
    throw new McpError(ErrorCode.InternalError, `Failed to get Luma camera motions: ${error.message}`);
  }
}

// Add Audio to Generation
export async function lumaAddAudioTool(args: any, exchange: any) {
  let validatedArgs: z.infer<typeof lumaAddAudioSchema>;
  try {
    validatedArgs = lumaAddAudioSchema.parse(args);
  } catch (error: any) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid arguments: ${error.errors.map((e: any) => e.message).join(', ')}`
    );
  }

  const apiKey = process.env.LUMAAI_API_KEY;
  if (!apiKey) {
    throw new McpError(ErrorCode.InternalError, 'LUMAAI_API_KEY is not configured.');
  }
  const lumaClient = new LumaAI({ authToken: apiKey });

  try {
    console.log(`[${new Date().toISOString()}] Adding audio to Luma generation: ${validatedArgs.generation_id}`);

    // Prepare payload for add audio
    const payload: LumaAI.GenerationAudioParams = { // Use suggested type GenerationAudioParams
      prompt: validatedArgs.prompt,
      negative_prompt: validatedArgs.negative_prompt,
      // generation_type: 'add_audio', // SDK might handle this or require it
    };
    // Remove undefined optional parameters
    Object.keys(payload).forEach(
      (key) => payload[key as keyof LumaAI.GenerationAudioParams] === undefined && delete payload[key as keyof LumaAI.GenerationAudioParams] // Use correct type here too
    );

    // Call the SDK method - Assuming it's under generations.addAudio or similar
    // The exact method might differ, adjust based on SDK v1.7.1 structure
    // Example: await lumaClient.generations.addAudio(validatedArgs.generation_id, payload);
    // Using generic request as placeholder:
    const updatedGeneration: LumaAI.Generation = await lumaClient.request({ // Explicitly type response
        method: 'post', // Use lowercase 'post'
        path: `/generations/${validatedArgs.generation_id}/audio`,
        body: payload,
        // Removed castTo, rely on explicit typing
    });


    // Check if the operation was successful (API might return updated generation or just status)
    // For simplicity, returning the response directly. Client might need to re-fetch if needed.
    return {
      content: [{ type: 'text', text: `Audio addition requested for ${validatedArgs.generation_id}. Response: ${JSON.stringify(updatedGeneration, null, 2)}` }],
    };
  } catch (error: any) {
    console.error('[Luma Add Audio Error]', error);
     if (error instanceof LumaAI.APIError) {
       if (error.status === 404) {
         throw new McpError(ErrorCode.InvalidRequest, `Luma generation ID ${validatedArgs.generation_id} not found.`);
       }
      throw new McpError(ErrorCode.InternalError, `Luma API Error: ${error.message}`);
    }
    throw new McpError(ErrorCode.InternalError, `Failed to add audio to Luma generation: ${error.message}`);
  }
}


// Upscale Generation
export async function lumaUpscaleTool(args: any, exchange: any) {
  let validatedArgs: z.infer<typeof lumaUpscaleSchema>;
  try {
    validatedArgs = lumaUpscaleSchema.parse(args);
  } catch (error: any) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid arguments: ${error.errors.map((e: any) => e.message).join(', ')}`
    );
  }

  const apiKey = process.env.LUMAAI_API_KEY;
  if (!apiKey) {
    throw new McpError(ErrorCode.InternalError, 'LUMAAI_API_KEY is not configured.');
  }
  const lumaClient = new LumaAI({ authToken: apiKey });
  const progressToken = exchange?.progressToken; // Get progress token

  try {
    console.log(`[${new Date().toISOString()}] Upscaling Luma generation: ${validatedArgs.generation_id} to ${validatedArgs.resolution}`);

    // Prepare payload for upscale
    const payload: LumaAI.GenerationUpscaleParams = {
      resolution: validatedArgs.resolution as '1080p' | '4k' | undefined, // Cast based on schema
      // generation_type: 'upscale_video', // SDK might handle this
    };
     // Remove undefined optional parameters
    Object.keys(payload).forEach(
      (key) => payload[key as keyof LumaAI.GenerationUpscaleParams] === undefined && delete payload[key as keyof LumaAI.GenerationUpscaleParams]
    );

    // Call the SDK method - Assuming generations.upscale exists
    // Example: const upscaleResponse = await lumaClient.generations.upscale(validatedArgs.generation_id, payload);
    // Using generic request as placeholder:
     const upscaleResponse: LumaAI.Generation = await lumaClient.request({ // Explicitly type response
        method: 'post', // Use lowercase 'post'
        path: `/generations/${validatedArgs.generation_id}/upscale`,
        body: payload,
        // Removed castTo, rely on explicit typing
    });

    // Upscaling is likely async, so we need the ID of the *new* upscale task if the API returns one,
    // or poll the original ID if the API updates it in place.
    // Assuming the response contains the ID of the task to poll (might be the original ID or a new one)
    const taskIdToPoll = upscaleResponse.id || validatedArgs.generation_id; // Access id from typed response

     if (!taskIdToPoll) {
        throw new McpError(
          ErrorCode.InternalError,
          'Luma AI Upscale API did not return a pollable task ID.'
        );
      }

    console.log(`[${new Date().toISOString()}] Luma AI upscale task initiated/updated with ID: ${taskIdToPoll}`);

    // Send initial confirmation
    exchange.sendProgress?.({
      token: progressToken,
      value: { status: 'INITIATED', taskId: taskIdToPoll, provider: 'lumaai', operation: 'upscale' },
    });

    // Start polling for the upscale result
    pollLumaTask({
      lumaClient,
      generationId: taskIdToPoll,
      mcpExchange: exchange,
      progressToken,
      expectedAssetType: 'upscaled_video', // Specify we expect an upscale result
    }).catch((error: any) => {
      console.error(
        `[${new Date().toISOString()}] Luma AI upscale polling failed for task ${taskIdToPoll}:`,
        error.message || error
      );
    });

    // Return immediately
    return {
      content: [
        {
          type: 'text',
          text: `Luma AI upscale task initiated for ID: ${taskIdToPoll}. Upscaling is in progress. Status updates will follow.`,
        },
      ],
    };
  } catch (error: any) {
    console.error('[Luma Upscale Error]', error);
     if (error instanceof LumaAI.APIError) {
       if (error.status === 404) {
         throw new McpError(ErrorCode.InvalidRequest, `Luma generation ID ${validatedArgs.generation_id} not found for upscaling.`);
       }
      throw new McpError(ErrorCode.InternalError, `Luma API Error: ${error.message}`);
    }
    throw new McpError(ErrorCode.InternalError, `Failed to upscale Luma generation: ${error.message}`);
  }
}
