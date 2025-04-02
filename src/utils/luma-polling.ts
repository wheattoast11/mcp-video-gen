import LumaAI from 'lumaai';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
// Removed incorrect Exchange import

const POLLING_INTERVAL_MS = 5000; // Poll every 5 seconds
const MAX_POLLING_ATTEMPTS = 60; // Max attempts (e.g., 60 * 5s = 5 minutes timeout)

// Define expected asset types
type ExpectedAssetType = 'video' | 'image' | 'upscaled_video'; // Add 'upscaled_video' for future

interface LumaPollOptions {
  lumaClient: LumaAI;
  generationId: string;
  mcpExchange: any; // Let TS infer or use Exchange from mcp.js if needed
  progressToken?: string; // Optional progress token
  expectedAssetType?: ExpectedAssetType; // Add expected asset type, default to 'video'
}

/**
 * Polls the Luma AI API for the status of a generation task.
 * Sends progress updates via MCP exchange.
 * Resolves with the asset URL on success, rejects on failure or timeout.
 */
export async function pollLumaTask({
  lumaClient,
  generationId,
  mcpExchange,
  progressToken,
  expectedAssetType = 'video', // Default to video if not specified
}: LumaPollOptions): Promise<string> {
  let attempts = 0;

  const sendProgress = (status: string, data?: any) => {
    // If progressToken exists, assume mcpExchange and sendProgress method exist
    if (progressToken) {
      mcpExchange.sendProgress({ // Removed optional chaining '?'
        token: progressToken,
        // Ensure data is nested under a key like 'result' or similar if needed by client
        value: { status, ...(data && { result: data }) }, // Nest data under 'result'
      });
      console.error(
        `[${new Date().toISOString()}] Progress sent for Luma task ${generationId}: ${status}`
      );
    }
  };

  return new Promise((resolve, reject) => {
    const intervalId = setInterval(async () => {
      attempts++;
      if (attempts > MAX_POLLING_ATTEMPTS) {
        clearInterval(intervalId);
        console.error(
          `[${new Date().toISOString()}] Luma polling timed out for task ${generationId} after ${MAX_POLLING_ATTEMPTS} attempts.`
        );
        sendProgress('TIMEOUT');
        return reject(
          new McpError(
            ErrorCode.InternalError, // Use InternalError for timeout
            `Polling timed out for Luma AI task ${generationId}`
          )
        );
      }

      try {
        console.error(
          `[${new Date().toISOString()}] Polling Luma task ${generationId} (Attempt ${attempts}/${MAX_POLLING_ATTEMPTS})...`
        );
        // Use the Luma SDK's method to get generation status
        const generationStatus = await lumaClient.generations.get(generationId);

        console.error(
          `[${new Date().toISOString()}] Luma task ${generationId} state: ${generationStatus.state}`
        );

        switch (generationStatus.state) {
          case 'completed': { // Use block scope for clarity
            clearInterval(intervalId);
            let assetUrl: string | undefined | null = null;
            let assetKey: string = 'assetUrl'; // Default key for progress message

            // Determine the correct asset URL based on expected type
            if (expectedAssetType === 'video') {
              assetUrl = generationStatus.assets?.video;
              assetKey = 'videoUrl';
            } else if (expectedAssetType === 'image') {
              assetUrl = generationStatus.assets?.image;
              assetKey = 'imageUrl';
            } else if (expectedAssetType === 'upscaled_video') {
              // Assuming upscale might return in assets.video or a specific key
              // Adjust this based on actual Luma API response for upscale
              assetUrl = generationStatus.assets?.video; // Placeholder - VERIFY THIS
              assetKey = 'upscaledVideoUrl';
            }

            if (assetUrl) {
              console.log(
                `[${new Date().toISOString()}] Luma task ${generationId} (${expectedAssetType}) succeeded. Asset URL: ${assetUrl}`
              );
              // Send the specific asset key and URL
              sendProgress('SUCCEEDED', { [assetKey]: assetUrl });
              resolve(assetUrl);
            } else {
              const reason = `Task completed but no ${expectedAssetType} URL found.`;
              console.error(
                `[${new Date().toISOString()}] Luma task ${generationId} ${reason}`
              );
              sendProgress('FAILED', { reason });
              reject(
                new McpError(
                  ErrorCode.InternalError,
                  `Luma AI task ${generationId} ${reason}`
                )
              );
            }
            break;
          } // Added missing closing brace for case block
          case 'failed': { // Added block scope for consistency
            clearInterval(intervalId);
            const failureReason =
              generationStatus.failure_reason || 'Unknown failure reason';
            console.error(
              `[${new Date().toISOString()}] Luma task ${generationId} failed: ${failureReason}`
            );
            sendProgress('FAILED', { reason: failureReason });
            reject(
              new McpError(
                ErrorCode.InternalError,
                `Luma AI task ${generationId} failed: ${failureReason}`
              )
            );
            break;
          } // Added missing closing brace for case block
          // Luma states based on type hints seem to be 'queued', 'dreaming', 'completed', 'failed'
          case 'queued':
          case 'dreaming':
            // Continue polling
            sendProgress(generationStatus.state.toUpperCase()); // Send status like QUEUED, DREAMING
            break;
          default:
            // Unexpected status
            console.warn(
              `[${new Date().toISOString()}] Luma task ${generationId} has unexpected state: ${generationStatus.state}`
            );
            sendProgress('UNKNOWN_STATUS', { status: generationStatus.state });
          // Continue polling
        }
      } catch (error: any) {
        // Handle errors during the polling request itself
        console.error(
          `[${new Date().toISOString()}] Error polling Luma task ${generationId}:`,
          error
        );
        if (error instanceof LumaAI.APIError && error.status === 404) {
          clearInterval(intervalId);
          sendProgress('FAILED', { reason: `Generation ID ${generationId} not found.` });
          reject(
            new McpError(
              ErrorCode.InvalidRequest,
              `Luma AI generation ID ${generationId} not found.`
            )
          );
        } else {
          sendProgress('POLLING_ERROR', { message: error.message });
        }
        // Continue polling unless it's a fatal error like 404
      }
    }, POLLING_INTERVAL_MS);
  });
}
