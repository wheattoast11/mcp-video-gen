# RunwayML + Luma AI MCP Server

This MCP server provides tools to interact with the RunwayML and Luma AI APIs for video and image generation tasks.

## Features

*   Generate videos from text prompts (RunwayML or Luma AI).
*   Generate videos from images (RunwayML or Luma AI).
*   Generate images from text prompts (Luma AI).
*   Manage Luma AI generations (list, get, delete).
*   Add audio to Luma AI generations.
*   Upscale Luma AI generations.
*   Enhance prompts using OpenRouter LLMs before generation.

## Prerequisites

*   Node.js (v18 LTS or later recommended)
*   npm (usually included with Node.js)
*   API Keys:
    *   RunwayML API Secret
    *   Luma AI API Key
    *   OpenRouter API Key (for the `enhance_prompt` tool)

## Installation

1.  **Clone or Download:** Obtain the server code.
2.  **Navigate to Directory:** Open a terminal in the server's root directory (`runwayml-mcp-server`).
3.  **Install Dependencies:**
    ```bash
    npm install
    ```

## Configuration

1.  **Create `.env` file:** In the server's root directory, create a file named `.env`.
2.  **Add API Keys:** Add your API keys to the `.env` file:
    ```dotenv
    RUNWAYML_API_SECRET=your_runwayml_api_secret_here
    LUMAAI_API_KEY=your_luma_api_key_here
    OPENROUTER_API_KEY=your_openrouter_api_key_here
    ```
    Replace the placeholder values with your actual keys.

## Running the Server

1.  **Build the Server:** Compile the TypeScript code:
    ```bash
    npm run build
    ```
2.  **Start the Server:**
    ```bash
    npm start
    ```
    You should see a message like `RunwayML MCP server running on stdio` in your terminal's error output (stderr).

## MCP Client Setup (e.g., Claude Desktop App, Cline)

Configure your MCP client to connect to this server. The exact steps depend on the client, but you'll typically need to provide:

*   **Name:** A descriptive name (e.g., `runway-luma-server`)
*   **Command:** `node`
*   **Arguments:** The full path to the compiled server index file (e.g., `/path/to/your/runwayml-mcp-server/build/server-index.js`)
*   **Environment Variables:**
    *   `RUNWAYML_API_SECRET`: Your RunwayML API Secret
    *   `LUMAAI_API_KEY`: Your Luma AI API Key
    *   `OPENROUTER_API_KEY`: Your OpenRouter API Key

**Example Configuration (Conceptual):**

```json
{
  "mcpServers": {
    "runway-luma-server": {
      "command": "node",
      "args": ["/full/path/to/runwayml-mcp-server/build/server-index.js"],
      "env": {
        "RUNWAYML_API_SECRET": "your_runwayml_api_secret_here",
        "LUMAAI_API_KEY": "your_luma_api_key_here",
        "OPENROUTER_API_KEY": "your_openrouter_api_key_here"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```
*(Remember to replace `/full/path/to/` with the actual path on your system)*

## Available Tools

*   **`generate_text_to_video`**: Generates video from text.
    *   `provider`: (Optional) `runwayml` (default) or `lumaai`.
    *   `promptText`: (Required) The text prompt.
    *   `runway_model`: (Optional) Runway model (e.g., "gen-2").
    *   `runway_resolution`: (Optional) Runway resolution (`1280:768` or `768:1280`).
    *   `runway_watermark`: (Optional) Boolean, default `false`.
    *   `luma_model`: (Optional) Luma model (`ray-flash-2`, `ray-2` (default), `ray-1-6`).
    *   `luma_aspect_ratio`: (Optional) Luma aspect ratio (e.g., `16:9` (default), `1:1`).
    *   `luma_loop`: (Optional) Boolean.
    *   `duration`: (Optional) Video duration in seconds (number).
    *   `seed`: (Optional) Generation seed (number).
*   **`generate_image_to_video`**: Generates video from an image.
    *   `provider`: (Optional) `runwayml` (default) or `lumaai`.
    *   `promptImage`: (Required) URL of the input image, or for Runway, an array `[{uri: "url", position: "first" | "last"}]`.
    *   `promptText`: (Optional) Text prompt to accompany the image.
    *   `runway_model`: (Optional) Runway model (`gen3a_turbo` (default)).
    *   `runway_duration`: (Optional) Runway duration (`5` (default) or `10`).
    *   `runway_ratio`: (Optional) Runway resolution (`1280:768` or `768:1280`).
    *   `runway_watermark`: (Optional) Boolean, default `false`.
    *   `luma_model`: (Optional) Luma model (`ray-flash-2`, `ray-2` (default), `ray-1-6`).
    *   `luma_aspect_ratio`: (Optional) Luma aspect ratio (e.g., `16:9` (default)).
    *   `luma_loop`: (Optional) Boolean.
    *   `seed`: (Optional) Generation seed (number).
*   **`enhance_prompt`**: Refines a prompt using OpenRouter.
    *   `original_prompt`: (Required) The prompt to enhance.
    *   `model`: (Optional) OpenRouter model name (defaults to a capable model like `anthropic/claude-3.5-sonnet`).
    *   `instructions`: (Optional) Specific instructions for the enhancement.
*   **`luma_generate_image`**: Generates an image using Luma AI.
    *   `prompt`: (Required) Text prompt.
    *   `aspect_ratio`: (Optional) Luma aspect ratio (`16:9` (default)).
    *   `model`: (Optional) Luma image model (`photon-1` (default), `photon-flash-1`).
    *   `image_ref`: (Optional) Array of image reference objects (`{url: string, weight?: number}`). Max 4.
    *   `style_ref`: (Optional) Array of style reference objects (`{url: string, weight?: number}`). Max 1.
    *   `character_ref`: (Optional) Character reference object (`{ identity0: { images: [url1, ...] } }`).
    *   `modify_image_ref`: (Optional) Modify image reference object (`{url: string, weight?: number}`).
*   **`luma_list_generations`**: Lists previous Luma AI generations.
    *   `limit`: (Optional) Number of results (default 10).
    *   `offset`: (Optional) Offset for pagination (default 0).
*   **`luma_get_generation`**: Gets details for a specific Luma AI generation.
    *   `generation_id`: (Required) UUID of the generation.
*   **`luma_delete_generation`**: Deletes a specific Luma AI generation.
    *   `generation_id`: (Required) UUID of the generation.
*   **`luma_get_camera_motions`**: Lists supported camera motions for Luma AI prompts. (No parameters).
*   **`luma_add_audio`**: Adds audio to a Luma generation.
    *   `generation_id`: (Required) UUID of the generation.
    *   `prompt`: (Required) Prompt for the audio.
    *   `negative_prompt`: (Optional) Negative prompt for audio.
*   **`luma_upscale`**: Upscales a Luma generation.
    *   `generation_id`: (Required) UUID of the generation.
    *   `resolution`: (Optional) Target resolution (`1080p` (default) or `4k`).

*(Note: For tools involving generation (`generate_*`, `luma_upscale`), the server initiates the task and returns immediately. Progress updates and the final result URL will be sent via MCP progress notifications.)*

## Example Workflows

Here are examples of how to combine the server's tools for common use cases:

### 1. Music Video Snippet (Cyberpunk Noir)

**Goal:** Create a 5-second cyberpunk noir video clip for the lyric "Neon rivers flowing through a city of chrome".

**Steps:**

1.  **Generate Base Image (Luma):**
    ```json
    {
      "tool_name": "luma_generate_image",
      "arguments": {
        "prompt": "Overhead shot of a dark, rainy cyberpunk city street at night. Bright neon signs reflect on wet pavement, resembling rivers of light flowing between towering chrome skyscrapers. Film noir aesthetic, photorealistic.",
        "aspect_ratio": "16:9"
      }
    }
    ```
    *(Wait for image generation to complete and get the image URL)*

2.  **Animate Image (Luma):**
    ```json
    {
      "tool_name": "generate_image_to_video",
      "arguments": {
        "provider": "lumaai",
        "promptImage": "{IMAGE_URL_FROM_STEP_1}",
        "promptText": "Slow pan left across the rainy cyberpunk cityscape, neon lights flickering subtly.",
        "luma_aspect_ratio": "16:9",
        "duration": 5
      }
    }
    ```
    *(Wait for video generation to complete)*

### 2. Product Ad Concept (Floating Earbud)

**Goal:** Create a 5-second video showing a futuristic earbud floating in a minimalist environment.

**Steps:**

1.  **Generate Scene with Product Reference (Luma):**
    ```json
    {
      "tool_name": "luma_generate_image",
      "arguments": {
        "prompt": "A single, sleek futuristic wireless earbud floats weightlessly in the center of a bright, minimalist white room with soft, diffused ambient light. Zero gravity effect.",
        "aspect_ratio": "1:1",
        "image_ref": [{ "url": "{PRODUCT_IMAGE_URL}", "weight": 0.8 }]
      }
    }
    ```
    *(Wait for image generation to complete and get the image URL)*

2.  **Animate Scene (Luma):**
    ```json
    {
      "tool_name": "generate_image_to_video",
      "arguments": {
        "provider": "lumaai",
        "promptImage": "{IMAGE_URL_FROM_STEP_1}",
        "promptText": "The earbud slowly rotates and drifts gently in zero gravity.",
        "luma_aspect_ratio": "1:1",
        "duration": 5
      }
    }
    ```
    *(Wait for video generation to complete)*

### 3. Image Animation (RunwayML Gen3a)

**Goal:** Animate an existing image using RunwayML's Gen3a model.

**Steps:**

1.  **(Optional) Generate Base Image (Luma):** Use `luma_generate_image` if you don't have an image.
2.  **Animate Image (RunwayML):**
    ```json
    {
      "tool_name": "generate_image_to_video",
      "arguments": {
        "provider": "runwayml",
        "promptImage": "{YOUR_IMAGE_URL}",
        "promptText": "Subtle zoom in, cinematic lighting.",
        "runway_model": "gen3a_turbo",
        "runway_duration": "5",
        "runway_ratio": "1280:768" // Or "768:1280"
      }
    }
    ```
    *(Wait for video generation to complete)*
