/**
 * Agent endpoints (Step 1 wiring).
 *
 * POST /api/agent/chat — talk to the procurement agent. The Step 2 iteration
 *                        adds catalog browsing + seller-agent negotiation and
 *                        returns richer transaction data.
 * GET  /api/agent/tools — advertise every PayPal tool the agent can currently use.
 */
import { Router } from "express";
import { z } from "zod";

import { runAgentTurn } from "../agent/run-agent-turn.js";
import { payPalMcpService } from "../mcp/paypal-mcp-client.js";

export const agentRoutes = Router();

const chatSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .max(30)
    .default([]),
});

agentRoutes.post("/agent/chat", async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid request body",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const { message, history } = parsed.data;
    const result = await runAgentTurn([...history, { role: "user", content: message }]);
    res.json({
      reply: result.reply,
      // Tool-call trace — the dashboard renders this as "agent reasoning".
      trace: result.trace,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent turn failed";
    const status = /missing|not configured|no tools/i.test(message) ? 503 : 502;
    res.status(status).json({ error: message });
  }
});

agentRoutes.get("/agent/tools", async (_req, res) => {
  try {
    await payPalMcpService.connect();
  } catch (error) {
    res.status(502).json({
      error: "PayPal MCP server is not reachable",
      detail: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  res.json({
    state: payPalMcpService.state,
    tools: payPalMcpService.toolList.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: tool.inputSchema ?? null,
    })),
  });
});
