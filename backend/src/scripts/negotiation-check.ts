/**
 * Negotiation sanity check — validates the buyer⇄seller multi-agent loop with
 * the deterministic (rule-based) seller, WITHOUT any API keys:
 *
 *   npm run negotiation-check --workspace backend
 *
 * Round 1: offer $80 (below the $88 floor) → seller must counter
 * Round 2: offer $88 (at floor)           → seller must accept at $88
 * Exits 1 if any invariant breaks.
 */
import { executeAgentTool } from "../agent/tools/registry.js";
import type { AgentToolContext } from "../agent/tools/types.js";
import type { NegotiationTurn } from "../agent/seller-agent.js";
import { logger } from "../logger.js";

const context: AgentToolContext = { negotiationSessions: new Map() };

function parseSellerBlock(result: string): { seller_decision?: string; seller_price?: number } {
  try {
    return JSON.parse(result) as { seller_decision?: string; seller_price?: number };
  } catch {
    return {};
  }
}

async function main(): Promise<void> {
  // Round 1 — lowball offer below the floor.
  const r1 = await executeAgentTool(
    "negotiate_with_seller",
    { item_id: "kb-nova75", proposed_price: 80, message: "$80 for the Nova75?" },
    context,
  );
  const d1 = parseSellerBlock(r1 ?? "");
  logger.info("neg-check", `round 1 → decision=${d1.seller_decision} price=${d1.seller_price}`);

  // Round 2 — offer exactly at the floor.
  const r2 = await executeAgentTool(
    "negotiate_with_seller",
    { item_id: "kb-nova75", proposed_price: 88, message: "$88 shipped, final offer." },
    context,
  );
  const d2 = parseSellerBlock(r2 ?? "");
  logger.info("neg-check", `round 2 → decision=${d2.seller_decision} price=${d2.seller_price}`);

  const turns: NegotiationTurn[] = context.negotiationSessions.get("kb-nova75") ?? [];

  const round1Countered = d1.seller_decision === "counter" && (d1.seller_price ?? 0) >= 88;
  const round2Accepted = d2.seller_decision === "accept" && d2.seller_price === 88;
  const sessionKept = turns.length === 4; // 2 buyer + 2 seller turns for kb-nova75

  logger.info("neg-check", `invariants → countered=${round1Countered} accepted=${round2Accepted} session=${sessionKept}`);

  if (round1Countered && round2Accepted && sessionKept) {
    logger.info("neg-check", "✅ negotiation loop validated (counter → accept at floor, state preserved)");
  } else {
    logger.error("neg-check", "❌ negotiation invariants broken");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  logger.error("neg-check", error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
