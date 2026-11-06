/**
 * Step 2 end-to-end CLI demo — a full shopping request through the agent,
 * without needing the frontend:
 *
 *   npm run demo:agent --workspace backend -- "Buy me the Nova75 keyboard, best price, $100 max"
 *   npm run demo:agent --workspace backend -- "Pay Alice $35.50 for finishing task G-42"
 *
 * Requires OPENAI_API_KEY (the negotiation persona + tool calls are LLM-driven).
 * PayPal tools also need sandbox credentials to actually move money.
 */
import { runAgentTurn } from "../agent/run-agent-turn.js";
import { payPalMcpService } from "../mcp/paypal-mcp-client.js";
import { transactionStore } from "../transactions/transaction-store.js";
import { logger } from "../logger.js";

async function main(): Promise<void> {
  try {
    const request =
      process.argv.slice(2).join(" ") || "Buy me the best mechanical keyboard under $100";
    logger.info("demo", `request → ${request}`);

    const result = await runAgentTurn([{ role: "user", content: request }]);

    console.log("\n──────────────── AGENT REPLY ────────────────\n");
    console.log(result.reply || "(no reply)");
    console.log("\n──────────────────── TRACE ──────────────────\n");
    for (const step of result.trace) {
      console.log(`  step ${step.step} · ${step.tool.padEnd(22)} (${step.durationMs}ms)`);
      console.log(`    args   ${JSON.stringify(step.args).slice(0, 140)}`);
      console.log(`    result ${step.resultPreview.replace(/\s+/g, " ").slice(0, 200)}`);
    }
    console.log("\n──────────────── TRANSACTIONS ────────────────\n");
    for (const tx of transactionStore.list({ limit: 20 })) {
      console.log(
        `  [${tx.status.padEnd(17)}] ${tx.kind.padEnd(6)} $${tx.amount.toFixed(2).padStart(9)}  ${
          tx.itemName ?? tx.batchId ?? "—"
        }  (${tx.id})`,
      );
    }
    console.log();
  } finally {
    // Teardown: the MCP child process keeps the event loop alive otherwise.
    await payPalMcpService.disconnect().catch(() => undefined);
  }
  process.exit(process.exitCode ?? 0);
}

main().catch((error) => {
  logger.error("demo", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
