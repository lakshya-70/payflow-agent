/**
 * PayPal MCP Server integration — the heart of Step 1.
 *
 * We spawn the OFFICIAL PayPal MCP server (`@paypal/mcp`) as a child process
 * and speak to it over stdio using the Model Context Protocol client SDK.
 * The server exposes real PayPal sandbox tools such as:
 *
 *   orders.create / orders.get / orders.capture
 *   payments.createRefund / payments.getRefunds
 *   transactions.list, invoices.*, products.*, subscriptions.*, shipment.*, disputes.*
 *
 * ⚠️  Note: payouts are NOT exposed by the MCP server today — Step 2/4 use the
 *     `@paypal/paypal-server-sdk` PayoutsClient directly for that.
 *
 * Security: the child process needs a PayPal access token. We mint one from the
 * sandbox credentials (see paypal/token-manager.ts) and rotate the server when
 * the token is refreshed. Streamed child stderr is surfaced in the logs so the
 * dashboard can later show "agent activity".
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { env } from "../config/env.js";
import { logger } from "../logger.js";
import { tokenManager } from "../paypal/token-manager.js";

/** Minimal shape of a tool advertised over MCP. `inputSchema` is plain JSON Schema. */
export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: { type: string; properties?: Record<string, unknown>; [key: string]: unknown };
}

type McpState = "idle" | "starting" | "ready" | "error";

interface SpawnSpec {
  command: string;
  args: string[];
}

/** CLI flag the official server requires: --tools=all | --tools=orders.create,… */
function toolsArg(): string {
  return `--tools=${env.PAYPAL_MCP_TOOLS}`;
}

/**
 * Resolve how to launch the PayPal MCP server.
 *
 * Preferred: run the locally-installed `@paypal/mcp` entrypoint directly with
 * `node` — no npx, no shell shims, identical behavior on Windows/macOS/Linux.
 * Fallback: npx. On Windows we must route through cmd.exe because Node ≥ 20
 * refuses to spawn .cmd/.bat shims directly (EINVAL).
 */
function resolveSpawnSpec(): SpawnSpec {
  try {
    const require = createRequire(import.meta.url);
    const pkgJsonPath = require.resolve("@paypal/mcp/package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")) as {
      bin?: string | Record<string, string>;
    };
    const binRelative = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.mcp;
    if (binRelative) {
      const entryPoint = path.join(path.dirname(pkgJsonPath), binRelative);
      return { command: process.execPath, args: [entryPoint, toolsArg()] };
    }
  } catch {
    // @paypal/mcp not installed locally — fall through to npx.
  }
  if (process.platform === "win32") {
    return { command: "cmd", args: ["/c", "npx", "-y", "@paypal/mcp", toolsArg()] };
  }
  return { command: "npx", args: ["-y", "@paypal/mcp", toolsArg()] };
}

/**
 * OpenAI tool names must match ^[a-zA-Z0-9_-]{1,64}$. We sanitize defensively
 * and keep a map back to the raw MCP name so calls resolve to the right tool.
 */
export function toOpenAiSafeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function fingerprint(token: string): string {
  return `${token.length}:${token.slice(0, 12)}`;
}

export class PayPalMcpService {
  private client?: Client;
  private transport?: StdioClientTransport;
  private connectPromise?: Promise<void>;
  private spawnedTokenFingerprint?: string;
  private refreshWatch?: NodeJS.Timeout;

  state: McpState = "idle";
  lastError?: string;
  startedAtMs?: number;

  private toolInfos: McpToolInfo[] = [];
  /** openai-safe tool name → raw MCP tool name */
  private nameMap = new Map<string, string>();

  /** Snapshot for /api/health and the dashboard. */
  get status() {
    return {
      state: this.state,
      toolCount: this.toolInfos.length,
      lastError: this.lastError ?? null,
      startedAtMs: this.startedAtMs ?? null,
    };
  }

  /** Full tool list (name + description + JSON schema), for /api/agent/tools. */
  get toolList(): McpToolInfo[] {
    return this.toolInfos;
  }

  /** Sanitized tool names currently available. */
  get toolNames(): string[] {
    return this.toolInfos.map((tool) => toOpenAiSafeName(tool.name));
  }

  /**
   * Connect to the MCP server (idempotent, single-flight).
   * Mints a sandbox token, spawns the child process, handshakes, caches tools.
   */
  async connect(): Promise<void> {
    if (this.state === "ready" || this.state === "starting") {
      return this.connectPromise ?? Promise.resolve();
    }
    this.connectPromise = this.start().finally(() => (this.connectPromise = undefined));
    return this.connectPromise;
  }

  private async start(): Promise<void> {
    this.state = "starting";
    this.lastError = undefined;

    try {
      if (!tokenManager.configured) {
        throw new Error(
          "PayPal credentials missing — add PAYPAL_CLIENT_ID & PAYPAL_CLIENT_SECRET to backend/.env",
        );
      }

      // 1) Token for the MCP server (cached; minted via OAuth on first use).
      const token = await tokenManager.getToken();
      this.spawnedTokenFingerprint = fingerprint(token);

      // 2) Spawn the official server over stdio.
      const { command, args } = resolveSpawnSpec();
      logger.info("mcp", `launching PayPal MCP server → ${command} ${args.join(" ")}`);

      const transport = new StdioClientTransport({
        command,
        args,
        // Contract of @paypal/mcp (see its dist/index.js): token + environment.
        env: {
          ...process.env,
          PAYPAL_ACCESS_TOKEN: token,
          PAYPAL_ENVIRONMENT: env.PAYPAL_ENV.toUpperCase(), // "SANDBOX" | "PRODUCTION"
        },
        // stdout belongs to JSON-RPC; pipe stderr so child logs stay visible.
        stderr: "pipe",
      });
      transport.stderr?.on("data", (chunk: Buffer) => {
        for (const line of chunk.toString().split("\n")) {
          if (line.trim()) logger.debug("mcp-server", line.replace(/[\r═]/g, "").trim());
        }
      });

      // 3) MCP handshake + tool discovery.
      const client = new Client({ name: "payflow-agent-backend", version: "0.1.0" });
      await client.connect(transport);
      const listed = await client.listTools();

      this.client = client;
      this.transport = transport;
      this.toolInfos = listed.tools as unknown as McpToolInfo[];
      this.nameMap = new Map(this.toolInfos.map((tool) => [toOpenAiSafeName(tool.name), tool.name]));

      this.state = "ready";
      this.startedAtMs = Date.now();
      logger.info(
        "mcp",
        `connected ✅ — ${this.toolInfos.length} PayPal tools live: ${this.toolNames.join(", ")}`,
      );
      this.watchForTokenRotation();
    } catch (error) {
      this.state = "error";
      this.lastError = error instanceof Error ? error.message : String(error);
      logger.error("mcp", `failed to connect: ${this.lastError}`);
      throw error;
    }
  }

  /**
   * Execute a tool by name. Returns the joined text content so the LLM can read
   * it as a plain string. Throws when the result is flagged as an error.
   */
  async callTool(rawName: string, args: Record<string, unknown> = {}): Promise<string> {
    await this.connect();
    if (!this.client) throw new Error("MCP client is not connected");

    const name = this.nameMap.get(rawName) ?? rawName;
    // Explicit shape (not the SDK's verbose union types) so minor SDK updates
    // never break this file — we only rely on the MCP spec fields we read.
    const result = (await this.client.callTool({ name, arguments: args })) as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };

    const text = (result.content ?? [])
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text as string)
      .join("\n");

    if (result.isError === true) throw new Error(text || `Tool "${name}" returned an error result`);
    return text || "(empty tool result)";
  }

  /** Tear down the child process and state (tests + token-rotation restarts). */
  async disconnect(): Promise<void> {
    if (this.refreshWatch) {
      clearInterval(this.refreshWatch);
      this.refreshWatch = undefined;
    }
    try {
      await this.client?.close();
    } catch (error) {
      logger.warn("mcp", `error while closing: ${error instanceof Error ? error.message : error}`);
    } finally {
      this.client = undefined;
      this.transport = undefined;
      this.toolInfos = [];
      this.nameMap.clear();
      this.startedAtMs = undefined;
      this.state = "idle";
    }
  }

  /**
   * Sandbox tokens expire within hours; rather than parsing auth errors out of
   * stderr, we poll the token manager (cheap, cached) and restart the server
   * when it hands back a different token.
   */
  private watchForTokenRotation(): void {
    if (this.refreshWatch || !tokenManager.configured) return;
    this.refreshWatch = setInterval(() => {
      void tokenManager
        .getToken()
        .then((token) => {
          if (this.state === "ready" && fingerprint(token) !== this.spawnedTokenFingerprint) {
            logger.info("mcp", "PayPal token rotated → restarting MCP server with fresh credentials");
            void this.restart();
          }
        })
        .catch(() => {
          // Token fetch failures are already logged by whoever triggers them.
        });
    }, 60_000);
    this.refreshWatch.unref?.();
  }

  private async restart(): Promise<void> {
    await this.disconnect();
    await this.connect();
  }
}

/** Singleton used across the app (routes, agent loop, smoke test). */
export const payPalMcpService = new PayPalMcpService();
