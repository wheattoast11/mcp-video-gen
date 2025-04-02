import RunwayML from '@runwayml/sdk'; // Use default import
import {
  McpError,
  ErrorCode,
  // CallToolRequestContext, // Removed incorrect type
} from '@modelcontextprotocol/sdk/types.js';

const POLLING_INTERVAL_MS = 5000; // Poll every 5 seconds
const MAX_POLLING_ATTEMPTS = 60; // Max attempts (e.g., 60 * 5s = 5 minutes timeout)

interface PollOptions {
  runwayClient: RunwayML;
  taskId: string;
  mcpExchange: any; // Use 'any' for exchange context type for now
  progressToken?: string; // Optional progress token
}

/**
 * Polls the RunwayML API for the status of a generation task.
 * Sends progress updates via MCP exchange.
 * Resolves with the video URL on success, rejects on failure or timeout.
 */
export async function pollRunwayTask({
  runwayClient,
  taskId,
  mcpExchange,
  progressToken,
}: PollOptions): Promise<string> {
  let attempts = 0;

  const sendProgress = (status: string, data?: any) => {
    if (progressToken) {
      mcpExchange.sendProgress({
        token: progressToken,
        value: { status, ...(data && { data }) },
      });
      console.error(
        `[${new Date().toISOString()}] Progress sent for task ${taskId}: ${status}`
      );
    }
  };

  return new Promise((resolve, reject) => {
    const intervalId = setInterval(async () => {
      attempts++;
      if (attempts > MAX_POLLING_ATTEMPTS) {
        clearInterval(intervalId);
        console.error(
          `[${new Date().toISOString()}] Polling timed out for task ${taskId} after ${MAX_POLLING_ATTEMPTS} attempts.`
        );
        sendProgress('TIMEOUT');
        return reject(
          new McpError(
            ErrorCode.InternalError, // Use InternalError for timeout
            `Polling timed out for RunwayML task ${taskId}`
          )
        );
      }

      try {
        console.error(
          `[${new Date().toISOString()}] Polling task ${taskId} (Attempt ${attempts}/${MAX_POLLING_ATTEMPTS})...`
        );
        // Use the SDK's method to get task status
        const taskStatus = await runwayClient.tasks.retrieve(taskId);

        console.error(
          `[${new Date().toISOString()}] Task ${taskId} status: ${taskStatus.status}`
        );

        switch (taskStatus.status) {
          case 'SUCCEEDED':
            clearInterval(intervalId);
            if (taskStatus.output && taskStatus.output.length > 0) {
              const videoUrl = taskStatus.output[0]; // Assuming the first output is the video URL
              console.log(
                `[${new Date().toISOString()}] Task ${taskId} succeeded. Video URL: ${videoUrl}`
              );
              sendProgress('SUCCEEDED', { videoUrl });
              resolve(videoUrl);
            } else {
              console.error(
                `[${new Date().toISOString()}] Task ${taskId} succeeded but no output URL found.`
              );
              sendProgress('FAILED', {
                reason: 'Task succeeded but no output URL found.',
              });
              reject(
                new McpError(
                  ErrorCode.InternalError, // Use InternalError for external API issues
                  `RunwayML task ${taskId} succeeded but returned no output URL.`
                )
              );
            }
            break;
          case 'FAILED':
            clearInterval(intervalId);
            // Construct failure reason based on status, as .error might not exist
            const failureReason = `RunwayML task failed (Status: FAILED)`;
            console.error(
              `[${new Date().toISOString()}] Task ${taskId} failed.`
            );
            sendProgress('FAILED', { reason: failureReason });
            reject(
              new McpError(
                ErrorCode.InternalError, // Use InternalError for external API issues
                failureReason // Use the constructed reason
              )
            );
            break;
          case 'PENDING':
          case 'RUNNING':
            // Continue polling
            sendProgress(taskStatus.status);
            break;
          default:
            // Unexpected status
            console.warn(
              `[${new Date().toISOString()}] Task ${taskId} has unexpected status: ${taskStatus.status}`
            );
            sendProgress('UNKNOWN_STATUS', { status: taskStatus.status });
          // Continue polling, maybe it's a transient state
        }
      } catch (error: any) {
        // Handle errors during the polling request itself
        console.error(
          `[${new Date().toISOString()}] Error polling task ${taskId}:`,
          error
        );
        // Don't stop polling immediately on transient network errors, but maybe limit retries?
        // For now, we let the max attempts handle timeouts.
        // If it's a specific API error (e.g., 404 Not Found), we might stop earlier.
        if (error instanceof RunwayML.APIError && error.status === 404) {
          clearInterval(intervalId);
          sendProgress('FAILED', { reason: `Task ID ${taskId} not found.` });
          reject(
            new McpError(
              ErrorCode.InvalidRequest, // Use InvalidRequest if task ID is wrong
              `RunwayML task ID ${taskId} not found.`
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
