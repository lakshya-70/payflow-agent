/**
 * Bridge between MCP tools and OpenAI "tool calling".
 *
 * MCP tools carry a JSON Schema `inputSchema`; OpenAI expects exactly that
 * shape inside `function.parameters` — so the conversion is 1:1, plus a
 * sanitized-name map for tool names that would violate OpenAI's naming rules.
 */
import type { ChatCompletionTool } from "openai/resources/chat/completions";

import { toOpenAiSafeName } from "./paypal-mcp-client.js";
import type { McpToolInfo, PayPalMcpService } from "./paypal-mcp-client.js";

/** MCP tool definitions → OpenAI `tools` array for chat.completions.create(). */
export function toOpenAiTools(tools: McpToolInfo[]): ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: toOpenAiSafeName(tool.name),
      description: tool.description ?? "",
      parameters: tool.inputSchema ?? { type: "object", properties: {} },
    },
  }));
}

/**
 * Execute a model-emitted tool call on the MCP server and format the response
 * for the next chat completion. Tool errors are returned as text (not thrown)
 * so the model can read the failure and self-correct instead of ending the turn.
 */
export async function executeMcpTool(
  mcp: PayPalMcpService,
  rawName: string,
  rawArguments: string | null | undefined,
): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = rawArguments ? (JSON.parse(rawArguments) as Record<string, unknown>) : {};
  } catch {
    return `ERROR: tool arguments were not valid JSON: ${rawArguments ?? "(none)"}`;
  }

  try {
    return await mcp.callTool(rawName, args);
  } catch (error) {
    return `TOOL_ERROR: ${error instanceof Error ? error.message : String(error)}`;
  }
}
