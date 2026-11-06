/**
 * Agent tool registry — PayFlow domain tools the checkout/payout agent can call,
 * merged at runtime with the official PayPal MCP server's tools (see
 * run-agent-turn.ts). Keeping our tools here (instead of inline) makes the
 * tool set explicit, discoverable, and easy to extend in later steps.
 */
import type { AgentTool, AgentToolContext } from "./types.js";
import { catalogTool } from "./catalog-tool.js";
import { negotiateTool } from "./negotiate-tool.js";
import { orderTool } from "./order-tool.js";
import { payoutTool } from "./payout-tool.js";
import { toOpenAiSafeName } from "../../mcp/paypal-mcp-client.js";

export const agentTools: AgentTool[] = [catalogTool, negotiateTool, orderTool, payoutTool];

/** OpenAI `tools` array for the PayFlow tools (MCP tools are added separately). */
export function agentToolDefs(): Array<{
  name: string;
  sanitized: string;
  description: string;
  parameters: Record<string, unknown>;
}> {
  return agentTools.map((tool) => ({
    name: tool.name,
    sanitized: toOpenAiSafeName(tool.name),
    description: tool.description,
    parameters: tool.parameters,
  }));
}

/** Execute a PayFlow tool; returns null when `name` is not one of ours (→ MCP fallback). */
export async function executeAgentTool(
  name: string,
  args: Record<string, unknown>,
  context: AgentToolContext,
): Promise<string | null> {
  const tool = agentTools.find(
    (candidate) => candidate.name === name || toOpenAiSafeName(candidate.name) === name,
  );
  if (!tool) return null;

  try {
    return await tool.execute(args, context);
  } catch (error) {
    // Never crash the agent turn on tool failure: hand the error to the model.
    return `ERROR: tool ${tool.name} threw — ${error instanceof Error ? error.message : String(error)}`;
  }
}
