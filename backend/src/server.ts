/**
 * PayFlow Agent backend — Express API entrypoint.
 *
 * Responsibilities (Step 1):
 *   - /api/health         → status snapshot for the Next.js dashboard
 *   - /api/agent/*        → chat with the procurement agent, list its tools
 *   - owns the PayPal MCP server child process (stdio) used by the agent loop
 *
 * Steps 2–4 register additional routers here (catalog/orders, payouts, webhooks).
 */
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";

import { env, llmConfigured, paypalCredsConfigured } from "./config/env.js";
import { logger } from "./logger.js";
import { payPalMcpService } from "./mcp/paypal-mcp-client.js";
import { agentRoutes } from "./routes/agent.routes.js";
import { catalogRoutes } from "./routes/catalog.routes.js";
import { gigRoutes } from "./routes/gig.routes.js";
import { healthRoutes } from "./routes/health.routes.js";
import { paypalRoutes } from "./routes/paypal.routes.js";
import { transactionRoutes } from "./routes/transactions.routes.js";
import { webhookRoutes } from "./routes/webhook.routes.js";

const app = express();

// The Next.js frontend is the only browser client, so keep CORS explicit.
const origins = env.FRONTEND_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({ origin: origins.includes("*") ? true : origins }));

app.use(express.json({ limit: "1mb" }));

// Lightweight request log (dev only).
app.use((req, _res, next) => {
  logger.debug("http", `${req.method} ${req.url}`);
  next();
});

app.use("/api", healthRoutes);
app.use("/api", agentRoutes);
app.use("/api", catalogRoutes);
app.use("/api", transactionRoutes);
app.use("/api", paypalRoutes);
app.use("/api", gigRoutes);
app.use("/api", webhookRoutes);
app.use("/api", transactionRoutes);
app.use("/api", paypalRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Central error handler — JSON responses only, never leak stack traces in prod.
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  logger.error("http", error instanceof Error ? error.stack ?? error.message : String(error));
  res.status(500).json({
    error: error instanceof Error ? error.message : "Internal server error",
  });
});

/** Warm up the PayPal MCP server in the background; /api/health reports state. */
function warmUpMcp(): void {
  payPalMcpService.connect().catch(() => {
    logger.warn("api", "MCP warm-up failed — the recorded error is visible via /api/health");
  });
}

const server = app.listen(env.PORT, () => {
  logger.info("api", `backend listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  logger.info(
    "api",
    `PayPal ${env.PAYPAL_ENV} | credentials: ${
      paypalCredsConfigured ? "configured" : "MISSING"
    } | LLM: ${llmConfigured ? env.OPENAI_MODEL : "API key missing"}`,
  );
  warmUpMcp();
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    logger.info("api", `${signal} received — shutting down`);
    await payPalMcpService.disconnect().catch(() => {});
    server.close(() => process.exit(0));
  });
}
