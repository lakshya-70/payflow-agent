/**
 * execute_paypal_payout — automated gig payouts to contractors.
 *
 * Used by the Freelancer Payout flow (Step 4: manager marks task complete →
 * LLM quality verification → this tool sends money). All guardrails and
 * bookkeeping live in payout-service.ts (shared with the payout console API).
 *
 * In PAYOUTS_MODE=mock regions (e.g. India) the payout is clearly labeled
 * simulated — no real PayPal Payouts call is made.
 */
import type { AgentTool } from "./types.js";
import { numberArg, stringArg } from "./types.js";
import { runPayout } from "./payout-service.js";

export const payoutTool: AgentTool = {
  name: "execute_paypal_payout",
  description:
    "Send an automated SANDBOX PayPal payout to a contractor by email (PayPal Payouts API). " +
    "Use it for the freelancer payout flow once work approval is confirmed, or when the user explicitly asks to pay someone. " +
    "Returns the PayPal payout batch id so the payout can be tracked. If the environment is configured for " +
    "simulated payouts, the result says so explicitly.",
  parameters: {
    type: "object",
    properties: {
      email: { type: "string", description: "Contractor's email address (must match their PayPal account)" },
      amount: { type: "number", description: "Payout amount in USD, e.g. 120.50" },
      note: { type: "string", description: "Short note to the contractor, e.g. task reference (≤ 255 chars)" },
      reasoning: {
        type: "string",
        description: "One sentence explaining why this payout is justified — recorded for the admin dashboard",
      },
    },
    required: ["email", "amount"],
  },

  async execute(args): Promise<string> {
    const outcome = await runPayout({
      email: stringArg(args, "email"),
      amount: numberArg(args, "amount"),
      note: stringArg(args, "note").trim() || undefined,
      reasoning: stringArg(args, "reasoning").trim() || undefined,
    });

    if (!outcome.ok) {
      return `TOOL_ERROR: Payout failed — ${outcome.error}`;
    }

    return JSON.stringify(
      {
        transaction_id: outcome.transactionId,
        paypal_batch_id: outcome.batchId,
        batch_status: outcome.batchStatus,
        simulated: Boolean(outcome.simulated),
        receiver: outcome.receiver,
        amount: outcome.amount,
        next_steps: outcome.simulated
          ? "Simulated payout completed instantly (PAYOUTS_MODE=mock — PayPal Payouts is not available to this sender country)."
          : "Payouts complete asynchronously — the receiver gets an email. Check via the MCP tool list_transactions or a Get-Payout call later.",
      },
      null,
      2,
    );
  },
};
