#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'; // Use Server from index
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema, // Keep schema for handler key
  ErrorCode,
  ListToolsRequestSchema, // Keep schema for handler key
  McpError,
  // Import specific request types if needed, otherwise rely on schema validation
  CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { z } from 'zod'; // Import Zod
import { zodToJsonSchema } from 'zod-to-json-schema'; // Import converter

// Load environment variables from .env file if it exists
dotenv.config();

// --- Tool Implementations ---
import {
  generateTextToVideoTool,
  generateTextToVideoSchema,
} from './tools/text-to-video-tool.js';
import {
  generateImageToVideoTool,
  generateImageToVideoSchema,
} from './tools/image-to-video-tool.js';
import {
  enhancePromptTool,
  enhancePromptSchema,
} from './tools/enhance-prompt-tool.js';
import {
  lumaGenerateImageTool,
  lumaGenerateImageSchema,
} from './tools/luma-generate-image-tool.js';
import {
  lumaListGenerationsTool,
  lumaListGenerationsSchema,
  lumaGetGenerationTool,
  lumaGetGenerationSchema,
  lumaDeleteGenerationTool,
  lumaDeleteGenerationSchema,
  lumaGetCameraMotionsTool,
  lumaGetCameraMotionsSchema,
  lumaAddAudioTool, // Import new tool
  lumaAddAudioSchema, // Import new schema
  lumaUpscaleTool, // Import new tool
  lumaUpscaleSchema, // Import new schema
} from './tools/luma-management-tool.js';

// --- Server Setup ---
const server = new Server( // Use Server class
  {
    name: 'runwayml-mcp-server',
    version: '0.1.0',
  },
  {
    // Declare server capabilities, specifically that it supports tools
    capabilities: {
        tools: {
            // listChanged: false // Optional: Set to true if you implement notifications/tools/list_changed
        }
    },
  }
);

// --- Tool Registration using setRequestHandler ---

// ListTools Handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'generate_text_to_video',
      description: 'Generates a video from text using RunwayML or Luma AI.',
      inputSchema: zodToJsonSchema(generateTextToVideoSchema, { target: 'openApi3' }), // Convert Zod to JSON Schema
    },
    {
      name: 'generate_image_to_video',
      description: 'Generates a video from an image using RunwayML or Luma AI.',
      inputSchema: zodToJsonSchema(generateImageToVideoSchema, { target: 'openApi3' }), // Convert Zod to JSON Schema
    },
    {
      name: 'enhance_prompt',
      description: 'Uses an LLM (via OpenRouter) to refine a prompt for video generation.',
      inputSchema: zodToJsonSchema(enhancePromptSchema, { target: 'openApi3' }), // Convert Zod to JSON Schema
    },
    {
      name: 'luma_generate_image',
      description: 'Generates an image using Luma AI.',
      inputSchema: zodToJsonSchema(lumaGenerateImageSchema, { target: 'openApi3' }), // Convert Zod to JSON Schema
    },
    {
      name: 'luma_list_generations',
      description: 'Lists previous Luma AI generations.',
      inputSchema: zodToJsonSchema(lumaListGenerationsSchema, { target: 'openApi3' }), // Convert Zod to JSON Schema
    },
    {
      name: 'luma_get_generation',
      description: 'Gets details for a specific Luma AI generation.',
      inputSchema: zodToJsonSchema(lumaGetGenerationSchema, { target: 'openApi3' }), // Convert Zod to JSON Schema
    },
    {
      name: 'luma_delete_generation',
      description: 'Deletes a specific Luma AI generation.',
      inputSchema: zodToJsonSchema(lumaDeleteGenerationSchema, { target: 'openApi3' }), // Convert Zod to JSON Schema
    },
    {
      name: 'luma_get_camera_motions',
      description: 'Lists supported camera motions for Luma AI prompts.',
      inputSchema: zodToJsonSchema(lumaGetCameraMotionsSchema, { target: 'openApi3' }), // Convert Zod to JSON Schema
    },
    {
      name: 'luma_add_audio',
      description: 'Adds audio to a specific Luma AI generation based on a prompt.',
      inputSchema: zodToJsonSchema(lumaAddAudioSchema, { target: 'openApi3' }), // Convert Zod to JSON Schema
    },
    {
      name: 'luma_upscale',
      description: 'Upscales a specific Luma AI generation to a higher resolution.',
      inputSchema: zodToJsonSchema(lumaUpscaleSchema, { target: 'openApi3' }), // Convert Zod to JSON Schema
    },
  ],
}));

// CallTool Handler
// Let the Server class handle the exchange type implicitly
server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest, exchange) => {
  const toolName = request.params.name;
  const args = request.params.arguments;

  console.error(`[${new Date().toISOString()}] Received tool call: ${toolName}`);

  try {
    switch (toolName) {
      case 'generate_text_to_video':
        return await generateTextToVideoTool(args, exchange);
      case 'generate_image_to_video':
        return await generateImageToVideoTool(args, exchange);
      case 'enhance_prompt':
        return await enhancePromptTool(args, exchange);
      case 'luma_generate_image':
        return await lumaGenerateImageTool(args, exchange);
      case 'luma_list_generations':
        return await lumaListGenerationsTool(args, exchange);
      case 'luma_get_generation':
        return await lumaGetGenerationTool(args, exchange);
      case 'luma_delete_generation':
        return await lumaDeleteGenerationTool(args, exchange);
      case 'luma_get_camera_motions':
        return await lumaGetCameraMotionsTool(args, exchange);
      case 'luma_add_audio': // Add case for new tool
        return await lumaAddAudioTool(args, exchange);
      case 'luma_upscale': // Add case for new tool
        return await lumaUpscaleTool(args, exchange);
      default:
        console.error(`[${new Date().toISOString()}] Unknown tool called: ${toolName}`);
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
    }
  } catch (error: any) {
    console.error(
      `[${new Date().toISOString()}] Error executing tool ${toolName}:`,
      error
    );
    if (error instanceof McpError) {
      throw error;
    } else {
      throw new McpError(
        ErrorCode.InternalError,
        `Error executing tool ${toolName}: ${error.message}`
      );
    }
  }
});

// Error handling should be done within each tool handler or via process-level listeners if needed

// --- Server Start ---
async function run() {
  try {
    // Check for required environment variables
    if (!process.env.RUNWAYML_API_SECRET) {
      throw new Error(
        'RUNWAYML_API_SECRET environment variable is required but not set.'
      );
    }
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error(
        'OPENROUTER_API_KEY environment variable is required for enhance_prompt tool but not set.'
      );
    }
    if (!process.env.LUMAAI_API_KEY) {
      throw new Error(
        'LUMAAI_API_KEY environment variable is required for Luma AI tools but not set.'
      );
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('RunwayML MCP server running on stdio');
  } catch (error: any) {
    console.error('Failed to start RunwayML MCP server:', error.message);
    process.exit(1); // Exit if essential setup fails
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.error('Received SIGINT, shutting down server...');
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Received SIGTERM, shutting down server...');
  await server.close();
  process.exit(0);
});

run();
