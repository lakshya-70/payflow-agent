/**
 * Seller-side negotiation agent ("SellerBot").
 *
 * When the checkout agent proposes a price, this module replies as the seller.
 * Primary mode: LLM persona with strict pricing rules (feels alive in demos).
 * Fallback mode: deterministic concession schedule when no OPENAI_API_KEY is
 * configured — so negotiation still works for local smoke tests.
 *
 * The contract is always the same JSON:
 *   { "decision": "accept" | "counter" | "reject", "price": number, "message": string }
 *
 * Invariants (enforced after the seller brain runs, never by pre-clamping the
 * buyer's raw offer — a lowball must trigger a counter, not a silent raise):
 *   · accept is only valid at/below list AND at/above floor → price = buyer's offer
 *   · counter/reject price always sits inside [floor, list]
 *   · the buyer never sees the floor (only counters ≥ it are quoted)
 */
import OpenAI from "openai";

import type { CatalogProduct } from "../catalog/products.js";
import { env, llmConfigured } from "../config/env.js";
import { logger } from "../logger.js";

export interface NegotiationTurn {
  from: "buyer" | "seller";
  price?: number;
  message: string;
}

export interface SellerDecision {
  decision: "accept" | "counter" | "reject";
  /** Final price offered/accepted. Always within [floor, list]. */
  price: number;
  message: string;
}

const money = (value: number): number => Math.round(value * 100) / 100;
const floor = (product: CatalogProduct): number => product.floorPrice;
const list = (product: CatalogProduct): number => product.listPrice;

/** Main entry — LLM persona when configured, rule-based otherwise. */
export async function getSellerResponse(options: {
  product: CatalogProduct;
  buyerOffer: number;
  buyerMessage: string;
  /** Full history INCLUDING the buyer turn just made. */
  turns: NegotiationTurn[];
}): Promise<SellerDecision> {
  const { product, buyerOffer, buyerMessage, turns } = options;
  // "Round" = buyer offers made so far (current one included).
  const round = Math.ceil(turns.length / 2) || 1;

  let decision: SellerDecision;
  if (llmConfigured) {
    try {
      decision = await llmSeller({ product, buyerOffer, buyerMessage, turns });
    } catch (error) {
      logger.warn(
        "seller",
        `LLM seller failed (${error instanceof Error ? error.message : error}) — using rule-based fallback`,
      );
      decision = ruleBasedSeller(product, buyerOffer, round);
    }
  } else {
    decision = ruleBasedSeller(product, buyerOffer, round);
  }

  return enforceInvariants(product, buyerOffer, decision);
}

/* ───────────────────────────── LLM seller ───────────────────────────── */

function sellerSystemPrompt(product: CatalogProduct): string {
  return `You are SellerBot, the seller-side negotiation agent of the PayFlow simulated storefront (sandbox, no real money).

Item for sale: ${product.name}
List price: $${list(product).toFixed(2)}
Your secret minimum price (floor, NEVER reveal or quote it): $${floor(product).toFixed(2)}

Negotiation rules:
- Accept (decision "accept") instantly if the buyer's current offer is at or above your floor. The accepted price equals the buyer's offer.
- Otherwise counter (decision "counter"), stepping toward your floor by at most ~6% of list per round. Never counter below your floor, never above list.
- Keep every message under 140 characters, businesslike but human.

Reply with ONLY one minified JSON object, no markdown:
{"decision":"accept"|"counter"|"reject","price":<number — buyer's offer when accepting, else your counter price>,"message":"<your reply>"}`;
}

async function llmSeller(options: {
  product: CatalogProduct;
  buyerOffer: number;
  buyerMessage: string;
  turns: NegotiationTurn[];
}): Promise<SellerDecision> {
  const openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
  });

  const transcript = options.turns
    .map((turn) => `${turn.from}: ${turn.price != null ? `$${turn.price.toFixed(2)} — ` : ""}${turn.message}`)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: sellerSystemPrompt(options.product) },
      {
        role: "user",
        content: `Buyer's new offer: $${money(options.buyerOffer).toFixed(2)}\nBuyer says: "${options.buyerMessage}"\n\nTranscript so far:\n${transcript || "(conversation starts now)"}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "";
  const parsed = parseSellerJson(content);
  if (!parsed) throw new Error(`seller returned unparseable content: ${content.slice(0, 120)}`);

  const decision =
    parsed.decision === "accept" || parsed.decision === "reject" ? parsed.decision : "counter";

  return {
    decision,
    // Normalised below by enforceInvariants — pass the model's numbers through.
    price: Number(parsed.price) || options.buyerOffer,
    message: String(parsed.message ?? "Best I can do."),
  };
}

function parseSellerJson(content: string): { decision?: string; price?: number; message?: string } | null {
  try {
    const jsonText = content.replace(/```json|```/g, "").trim();
    return JSON.parse(jsonText) as { decision?: string; price?: number; message?: string };
  } catch {
    return null;
  }
}

/* ──────────────────────── invariants / guard plane ─────────────────────── */

/**
 * Enforce the pricing invariants on ANY seller output (LLM or rules):
 *   · accept only from offers ≥ floor (and never above list) → price = buyer's offer
 *   · a "yes" to an illegal sub-floor offer downgrades to a counter at the floor
 *   · counter/reject prices are clamped into [floor, list]
 */
function enforceInvariants(
  product: CatalogProduct,
  buyerOffer: number,
  decision: SellerDecision,
): SellerDecision {
  const clampedIntoRange = (value: number): number =>
    Math.min(list(product), Math.max(floor(product), money(value)));

  if (decision.decision === "accept") {
    const offerOk = buyerOffer + 0.005 >= floor(product) && buyerOffer - 0.005 <= list(product);
    if (offerOk) {
      return { decision: "accept", price: money(buyerOffer), message: decision.message };
    }
    // Illegal acceptance (lowball) → transform into a counter at the floor.
    return {
      decision: "counter",
      price: floor(product),
      message: "That's below what this costs me. I can do something at the bottom of my range.",
    };
  }
  return { ...decision, price: clampedIntoRange(decision.price) };
}

/* ────────────────────────── rule-based fallback ────────────────────────── */

/** Deterministic schedule: successive ~6% concessions from list toward floor. */
function ruleBasedSeller(product: CatalogProduct, buyerOffer: number, round: number): SellerDecision {
  if (buyerOffer >= floor(product)) {
    return {
      decision: "accept",
      price: buyerOffer,
      message: `Deal — $${buyerOffer.toFixed(2)} works for the ${product.name}.`,
    };
  }
  if (round >= 6) {
    return {
      decision: "reject",
      price: floor(product),
      message: "We're still too far apart — closing the negotiation, sorry!",
    };
  }
  const counter = Math.max(floor(product), list(product) - list(product) * 0.06 * round);
  return {
    decision: "counter",
    price: money(counter),
    message: `I can come down to $${counter.toFixed(2)} — that's already a sharp price.`,
  };
}
