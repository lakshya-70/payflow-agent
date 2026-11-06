/**
 * The LLM ⇄ agent-tools loop (Step 1 boilerplate, extended in Step 2).
 *
 * Flow:
 *   user message
 *     → OpenAI chat completion with a MERGED tool set:
 *         · PayFlow tools   (catalog, negotiate, order, payout) — see tools/registry.ts
 *         · PayPal MCP tools (get_order, list_transactions, refunds, …) — official @paypal/mcp
 *     → if the model emits tool calls: PayFlow tools run in-process (executing
 *       real PayPal REST/SDK calls behind the scenes); everything else is
 *       executed on the PayPal MCP server; results are appended as "tool"
 *       messages and the loop continues
 *     → until the model answers in natural language (or the tool budget is hit)
 *
 * Every executed tool call is recorded in an AgentTraceStep so the Step 3
 * dashboard can show "agent reasoning" next to each transaction.
 */
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import { env, llmConfigured } from "../config/env.js";
import { logger } from "../logger.js";
import { payPalMcpService, toOpenAiSafeName } from "../mcp/paypal-mcp-client.js";
import { executeMcpTool, toOpenAiTools } from "../mcp/openai-bridge.js";
import { agentToolDefs, executeAgentTool } from "./tools/registry.js";
import type { AgentToolContext } from "./tools/types.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";

/** Safety cap on tool-call rounds per turn (negotiation needs a few). */
const MAX_TOOL_STEPS = 10;

export interface AgentTraceStep {
  step: number;
  tool: string;
  args: Record<string, unknown>;
  resultPreview: string;
  durationMs: number;
}

export interface AgentTurnResult {
  reply: string;
  trace: AgentTraceStep[];
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

let openai: OpenAI | undefined;

function getOpenAi(): OpenAI {
  if (!llmConfigured) {
    throw new Error("LLM not configured — add OPENAI_API_KEY to backend/.env");
  }
  openai ??= new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
  });
  return openai;
}

export async function runAgentTurn(history: ChatTurn[]): Promise<AgentTurnResult> {
  const client = getOpenAi();
  const model = env.OPENAI_MODEL;

  const mcp = payPalMcpService;
  // Lazy-boot: keeps the loop working even if the boot-time warm-up failed.
  await mcp.connect();

  // Build the merged tool set: PayFlow tools first, then MCP tools.
  const payFlowTools = agentToolDefs().map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.sanitized,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
  const mcpTools = toOpenAiTools(mcp.toolList);
  const tools = [...payFlowTools, ...mcpTools];
  if (tools.length === 0) {
    throw new Error("No tools available — check PayPal MCP state and backend logs");
  }

  // Per-turn tool context: negotiation sessions etc. die with the request,
  // so no negotiation state can leak between different user conversations.
  const toolContext: AgentToolContext = { negotiationSessions: new Map() };

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map(
      (turn) => ({ role: turn.role, content: turn.content }) as ChatCompletionMessageParam,
    ),
  ];

  const trace: AgentTraceStep[] = [];
  /** Tracks whether we already nudged the model after an empty (no-tool) reply. */
  let nudged = false;

  for (let step = 1; step <= MAX_TOOL_STEPS; step++) {
    const completion = await client.chat.completions.create({
      model,
      messages,
      tools,
      temperature: 0.2,
    });
    const message = completion.choices[0]?.message;
    if (!message) throw new Error("LLM returned no message");

    // Reasoning models (e.g. gpt-oss) attach a `reasoning` field to assistant
    // messages — echoing it back can make the next round return empty content.
    // Re-send only the standard fields.
    messages.push({
      role: "assistant",
      content: message.content,
      ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
    });

    const toolCalls =
      message.tool_calls?.filter(
        (call): call is Extract<(typeof call), { type: "function" }> => call.type === "function",
      ) ?? [];

    // No tool calls → the model is done: return the natural-language answer.
    if (toolCalls.length === 0) {
      const reply = message.content?.trim() || "";
      if (reply) return { reply, trace };
      // Empty reply (typically the reasoning-token echo problem) — nudge once.
      if (!nudged) {
        nudged = true;
        logger.warn("agent", "empty reply without tool calls — nudging the model to answer");
        messages.push({
          role: "user",
          content: "Resume: give your final answer now, using the tool results you already have.",
        });
        continue;
      }
      return { reply: "(no content)", trace };
    }

    for (const call of toolCalls) {
      const startedAt = Date.now();
      const rawArgs = call.function?.arguments ?? null;
      const parsedArgs = safeParseArgs(rawArgs);
      const toolName = call.function?.name ?? "";

      // PayFlow tools first; fall back to the PayPal MCP server.
      const payFlowResult = await executeAgentTool(toolName, parsedArgs, toolContext);
      const resultText =
        payFlowResult ?? (await executeMcpTool(mcp, toOpenAiSafeName(toolName), rawArgs));

      trace.push({
        step,
        tool: toolName || "?",
        args: parsedArgs,
        resultPreview: resultText.slice(0, 400),
        durationMs: Date.now() - startedAt,
      });
      logger.info(
        "agent",
        `step ${step} · tool=${toolName || "?"} → ${resultText.slice(0, 120).replace(/\s+/g, " ")}`,
      );

      messages.push({ role: "tool", tool_call_id: call.id, content: resultText });
    }
  }

  // Out of tool budget: force a plain-text wrap-up (no tools) so the user still gets an answer.
  logger.warn("agent", `tool budget (${MAX_TOOL_STEPS}) exhausted — forcing a final answer`);
  const final = await client.chat.completions.create({ model, messages });
  return { reply: final.choices[0]?.message?.content?.trim() ?? "(no reply)", trace };
}

function safeParseArgs(raw: string | null | undefined): Record<string, unknown> {
  try {
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
