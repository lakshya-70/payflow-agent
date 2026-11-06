/**
 * LLM receipt writer (Step 4 webhook flow).
 *
 * When PayPal confirms a buyer approval/capture via webhook, PayFlow writes a
 * clean, human-facing receipt into the transaction record:
 *   order summary + amount + paypal refs + a one-line thanks.
 *
 * LLM turns the raw events into a tidy paragraph; a deterministic formatter
 * keeps receipts available even without a key.
 */
import OpenAI from "openai";

import type { TransactionRecord } from "../transactions/transaction-store.js";
import { env, llmConfigured } from "../config/env.js";
import { logger } from "../logger.js";

const fmtUsd = (txn: TransactionRecord): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: txn.currency }).format(txn.amount);

/** Deterministic baseline receipt (also the LLM's grounding data). */
export function baseReceipt(txn: TransactionRecord): string {
  const what = txn.kind === "order" ? `Item: ${txn.itemName ?? txn.itemId ?? "—"}` : "Gig payout";
  const ref = txn.paypalId ? `PayPal order: ${txn.paypalId}` : `Payout batch: ${txn.batchId ?? "—"}`;
  return `${what} · ${what.startsWith("Item") ? "Amount" : "Amount"}: ${fmtUsd(txn)} · ${ref}`;
}

/** Full receipt: 2–3 tidy sentences. LLM-styled when a key is configured. */
export async function composeReceipt(txn: TransactionRecord, event: string): Promise<string> {
  const base = baseReceipt(txn);

  if (!llmConfigured) {
    return `✅ Receipt — ${event}: ${base} · Status: ${txn.status}. Thanks from the PayFlow sandbox desk — no real money moved.`;
  }

  try {
    const openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
    });
    const completion = await openai.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0.4,
      // Reasoning models (gpt-oss) spend tokens thinking before writing — a tiny
      // cap yields an empty content field. 500 keeps receipts small but safe.
      max_completion_tokens: 500,
      messages: [
        {
          role: "system",
          content:
            "You write short, warm, professional payment receipts for the PayFlow platform (a PayPal sandbox demo). " +
            "Use ONLY the facts given — never invent names, ids or amounts. 2 sentences max, plain text, no markdown.",
        },
        {
          role: "user",
          content: `Write the receipt. Payment event: ${event}\nFacts: ${base} · Transaction status: ${txn.status}.`,
        },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (text) return `✅ ${text}`;
    throw new Error("empty receipt");
  } catch (error) {
    logger.warn("receipt", `LLM receipt failed (${error instanceof Error ? error.message.slice(0, 80) : "error"}) — using baseline`);
    return `✅ Receipt — ${event}: ${base} · Status: ${txn.status}. (LLM receipt unavailable — deterministic fallback.)`;
  }
}
