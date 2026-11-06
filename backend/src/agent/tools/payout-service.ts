/**
 * Shared payout service — single source of truth for money out.
 *
 * Both surfaces use it:
 *   · execute_paypal_payout (the agent tool)
 *   · POST /api/gigs/:id/payout (the Step 4 freelancer payout console)
 *
 * Guardrails live here: validated email, bounded amounts, transaction-store
 * bookkeeping (payout_initiated → completed/failed) and readable errors.
 */
import { sendPayPalPayout } from "../../paypal/payouts.js";
import { transactionStore } from "../../transactions/transaction-store.js";
import { logger } from "../../logger.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const money = (value: number): number => Math.round(value * 100) / 100;

export interface PayoutInput {
  email: string;
  amount: number;
  note?: string;
  reasoning?: string;
}

/** Structured payout outcome (never throws — errors come back as `error`). */
export interface PayoutOutcome {
  ok: boolean;
  transactionId?: string;
  batchId?: string;
  batchStatus?: string;
  receiver?: string;
  amount?: number;
  /** true when PAYOUTS_MODE=mock produced a clearly-labeled simulated payout. */
  simulated?: boolean;
  error?: string;
}

/** Validate + execute one payout. */
export async function runPayout(input: PayoutInput): Promise<PayoutOutcome> {
  const email = (input.email ?? "").trim();
  const amount = Number(input.amount);

  if (!EMAIL_RE.test(email)) return { ok: false, error: `"${email}" is not a valid email address.` };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "amount must be a positive number (USD)." };
  }
  if (amount < 0.01 || amount > 10000) {
    return { ok: false, error: "amount must be between $0.01 and $10,000 per payout (guardrail)." };
  }

  const record = transactionStore.create({
    kind: "payout",
    agent: "payout-agent",
    amount: money(amount),
    status: "payout_initiated",
    note: [input.reasoning, input.note].filter(Boolean).join(" — ") || undefined,
  });

  try {
    const payout = await sendPayPalPayout({ receiverEmail: email, amountUsd: amount, note: input.note });
    // Simulated batches complete instantly (demo); real ones stay initiated.
    transactionStore.patch(record.id, {
      batchId: payout.batchId,
      note: payout.simulated
        ? `simulated payout — PAYOUTS_MODE=mock · ${payout.batchStatus}`
        : payout.batchStatus,
    });
    if (payout.simulated) transactionStore.setStatus(record.id, "payout_completed");

    logger.info(
      "payout",
      `${payout.simulated ? "simulated payout" : "payout"} ${payout.batchId} → ${email} @ $${payout.amountUsd.toFixed(2)}`,
    );
    return {
      ok: true,
      transactionId: record.id,
      batchId: payout.batchId,
      batchStatus: payout.batchStatus,
      receiver: email,
      amount: payout.amountUsd,
      simulated: payout.simulated,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    transactionStore.setStatus(record.id, "failed");
    transactionStore.patch(record.id, { note: message.slice(0, 200) });
    logger.error("payout", `payout failed: ${message}`);
    return { ok: false, transactionId: record.id, error: message };
  }
}
