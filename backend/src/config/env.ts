/**
 * Central, validated environment configuration.
 *
 * All secrets come from `backend/.env` — nothing is ever hardcoded.
 * See `backend/.env.example` for the full, documented list.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

// Load backend/.env relative to this file so scripts work regardless of cwd.
const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(here, "../../.env"); // src/config → backend/.env
dotenv.config({ path: envPath, override: false });

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Express API port (the Next.js frontend talks to this server).
  PORT: z.coerce.number().int().positive().default(4000),

  // PayPal REST environment — every money movement in this project is sandbox-first.
  PAYPAL_ENV: z.enum(["sandbox", "production"]).default("sandbox"),

  // PayPal REST credentials from developer.paypal.com (Apps & Credentials).
  PAYPAL_CLIENT_ID: z.string().min(1).optional(),
  PAYPAL_CLIENT_SECRET: z.string().min(1).optional(),

  // Optional pre-minted access token (e.g. produced in Postman). The official
  // PayPal MCP server authenticates with a token, not the id/secret pair.
  PAYPAL_ACCESS_TOKEN: z.string().min(1).optional(),

  // LLM credentials (OpenAI, or any OpenAI-compatible gateway via OPENAI_BASE_URL).
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_BASE_URL: z.string().url().optional(),

  // Tool filter handed to the PayPal MCP server: "all" or a comma-separated set.
  PAYPAL_MCP_TOOLS: z.string().default("all"),

  // Orders at or above this USD amount require human/admin approval before the
  // PayPal order is created (human-in-the-loop guardrail for the agent).
  PAYFLOW_APPROVAL_THRESHOLD: z.coerce.number().int().nonnegative().default(500),

  // Payouts transport:
  //  · "api"  — real PayPal Payouts REST calls (requires a sender account in a
  //             Payouts-supported country)
  //  · "mock" — clearly-labeled simulated payouts for landscapes/regions PayPal
  //             does not serve as sender (e.g. India). No false money claims —
  //             every row is tagged "simulated".
  PAYOUTS_MODE: z.enum(["api", "mock"]).default("api"),

  // Optional webhook id for POST /api/webhooks/paypal signature verification
  // (developer dashboard → Webhooks). Verification is skipped when unset (demo).
  PAYPAL_WEBHOOK_ID: z.string().optional(),

  // CORS allowlist for the Next.js dev server (comma-separated origins).
  FRONTEND_ORIGIN: z.string().default("http://localhost:3000"),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast with a readable message instead of a cryptic runtime error later.
  console.error("❌ Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

/** True when sandbox PayPal REST credentials are present. */
export const paypalCredsConfigured = Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);

/** True when an OpenAI-compatible LLM can be reached. */
export const llmConfigured = Boolean(env.OPENAI_API_KEY);
