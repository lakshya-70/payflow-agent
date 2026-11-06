/**
 * Step 2 tool dry-run — exercises every PayFlow agent tool directly, without an
 * LLM, so the tool layer itself is validated:
 *
 *   npm run tools:dry-run --workspace backend
 *
 * Expected results WITHOUT credentials/keys:
 *   ✅ get_product_catalog   — real data (always works)
 *   ✅ negotiate_with_seller — rule-based seller fallback (LLM persona when key set)
 *   ❌ create_paypal_order   — readable "credentials missing" error (or a real PayPal 401)
 *   ❌ execute_paypal_payout — same
 * With credentials + OpenAI key set, every tool runs against the sandbox APIs.
 */
import { agentTools, executeAgentTool } from "../agent/tools/registry.js";
import type { AgentToolContext } from "../agent/tools/types.js";
import { logger } from "../logger.js";

const context: AgentToolContext = { negotiationSessions: new Map() };

async function main(): Promise<void> {
  for (const tool of agentTools) {
    logger.info("dry-run", `▶ ${tool.name}`);
    let args: Record<string, unknown>;
    switch (tool.name) {
      case "get_product_catalog":
        args = { query: "keyboard" };
        break;
      case "negotiate_with_seller":
        args = { item_id: "kb-nova75", proposed_price: 92, message: "I can offer $92 for the Nova75." };
        break;
      case "create_paypal_order":
        args = { item_id: "kb-nova75", amount: 92, reasoning: "Dry-run validation" };
        break;
      case "execute_paypal_payout":
        args = { email: "sandbox-buyer@example.com", amount: 25, note: "Dry-run validation" };
        break;
      default:
        args = {};
    }

    const result = await executeAgentTool(tool.name, args, context);
    if (result === null) {
      logger.error("dry-run", `  ✘ tool not found in registry!`);
      process.exitCode = 1;
      continue;
    }
    const firstLine = result.split("\n", 1)[0] ?? "";
    const verdict = /^(ERROR|TOOL_ERROR)/.test(firstLine.trim())
      ? "⚠️ readable tool error (expected without credentials):"
      : "✅";
    logger.info("dry-run", `  ${verdict} ${firstLine.slice(0, 140)}`);
  }

  logger.info("dry-run", "✅ Tool layer dry-run complete.");
}

main().catch((error) => {
  logger.error("dry-run", error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
