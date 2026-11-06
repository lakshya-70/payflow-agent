/**
 * Step 1 smoke test — validates the backend ⇄ PayPal MCP Server wiring.
 *
 *   npm run smoke:mcp --workspace backend
 *
 * It:
 *   1. Tries to mint a real sandbox access token (needs real PAYPAL_CLIENT_ID/SECRET).
 *   2. Falls back to a dummy token when credentials are placeholders, so the MCP
 *      wiring itself can still be verified (tool listing works offline; real
 *      authenticated tool calls need a valid token).
 *   3. Boots the official `@paypal/mcp` server over stdio, lists its tools, exits.
 */
import { env, paypalCredsConfigured } from "../config/env.js";
import { logger } from "../logger.js";
import { payPalMcpService } from "../mcp/paypal-mcp-client.js";
import { tokenManager } from "../paypal/token-manager.js";

async function main(): Promise<void> {
  logger.info(
    "smoke",
    `PayPal env: ${env.PAYPAL_ENV} | credentials: ${
      paypalCredsConfigured ? "present" : "missing"
    } | tool filter: ${env.PAYPAL_MCP_TOOLS}`,
  );

  let tokenOk = false;

  // 1) Token path.
  if (tokenManager.configured) {
    try {
      const token = await tokenManager.getToken();
      logger.info("smoke", `OAuth token OK → ${token.slice(0, 12)}… (length ${token.length})`);
      tokenOk = true;
    } catch (error) {
      logger.warn(
        "smoke",
        `OAuth token fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // 2) Fall back to a dummy token so the MCP server can boot and list tools.
  if (!tokenOk) {
    logger.warn(
      "smoke",
      "No usable PayPal token — booting the MCP server with a DUMMY token. " +
        "Tool listing will work; authenticated tool calls will fail. Add real sandbox credentials to backend/.env for the full path.",
    );
    env.PAYPAL_ACCESS_TOKEN = "dummy-token-for-mcp-smoke-test";
  }

  // 3) MCP boot + tool discovery.
  try {
    await payPalMcpService.connect();
    const tools = payPalMcpService.toolList;
    logger.info("smoke", `✅ PayPal MCP server connected — ${tools.length} tools exposed:`);
    for (const tool of tools) {
      logger.info("smoke", `  • ${tool.name.padEnd(28)} ${(tool.description ?? "").slice(0, 96)}`);
    }
    logger.info("smoke", "✅ Step 1 MCP wiring validated.");
  } catch (error) {
    logger.error(
      "smoke",
      `❌ MCP wiring failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  } finally {
    await payPalMcpService.disconnect().catch(() => {});
  }
}

main()
  .catch((error) => {
    logger.error("smoke", error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
