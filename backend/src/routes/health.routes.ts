/**
 * GET /api/health — one-stop status snapshot consumed by the dashboard shell.
 * Always answers 200 when the Express server is alive; individual subsystems
 * report their own state so the UI can degrade gracefully.
 */
import { Router } from "express";

import { env, llmConfigured, paypalCredsConfigured } from "../config/env.js";
import { payPalMcpService } from "../mcp/paypal-mcp-client.js";

export const healthRoutes = Router();

healthRoutes.get("/health", (_req, res) => {
  const mcp = payPalMcpService.status;

  res.json({
    ok: true,
    service: "payflow-agent/backend",
    nodeEnv: env.NODE_ENV,
    uptimeSeconds: Math.round(process.uptime()),
    paypal: {
      environment: env.PAYPAL_ENV,
      credentialsConfigured: paypalCredsConfigured,
    },
    mcp: {
      state: mcp.state, // "idle" | "starting" | "ready" | "error"
      toolCount: mcp.toolCount,
      lastError: mcp.lastError,
    },
    llm: {
      configured: llmConfigured,
      model: env.OPENAI_MODEL,
    },
  });
});
