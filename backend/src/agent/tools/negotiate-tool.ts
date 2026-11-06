/**
 * negotiate_with_seller — the multi-agent negotiation loop.
 *
 * The checkout agent sends a counter-offer + message for a product; the tool
 * runs seller-side (seller-agent.ts: LLM persona or rule fallback), appends the
 * reply to this turn's per-item negotiation session, and returns the decision.
 *
 * The negotiation state lives in AgentToolContext (one Map per agent turn), so
 * sessions never leak between different user requests.
 */
import { findProduct } from "../../catalog/catalog.service.js";
import { getSellerResponse, type NegotiationTurn } from "../seller-agent.js";
import type { AgentTool, AgentToolContext } from "./types.js";
import { numberArg, stringArg } from "./types.js";

export const negotiateTool: AgentTool = {
  name: "negotiate_with_seller",
  description:
    "Send a counter-offer (or question) to the seller agent for a product. The seller replies with " +
    "accept / counter / reject and a price. Keep negotiating until the seller accepts, " +
    "then finalize the purchase with create_paypal_order using the accepted price.",
  parameters: {
    type: "object",
    properties: {
      item_id: { type: "string", description: "Product id from get_product_catalog" },
      proposed_price: { type: "number", description: "Your price offer in USD" },
      message: { type: "string", description: "Short message to the seller explaining your offer" },
    },
    required: ["item_id", "proposed_price", "message"],
  },

  async execute(args, context): Promise<string> {
    const itemId = stringArg(args, "item_id").trim();
    const proposedPrice = numberArg(args, "proposed_price");
    const message = stringArg(args, "message").trim() || "Make me a deal on this.";

    const product = findProduct(itemId);
    if (!product) {
      return `ERROR: unknown item_id "${itemId}" — call get_product_catalog first.`;
    }
    if (!Number.isFinite(proposedPrice) || proposedPrice <= 0) {
      return "ERROR: proposed_price must be a positive number (USD).";
    }
    if (!product.negotiable) {
      return JSON.stringify({
        decision: "accept",
        price: product.listPrice,
        message: "Fixed-price product — no negotiation.",
        notice: "Order with create_paypal_order(item_id, amount=list_price).",
      });
    }

    // Per-turn negotiation session for this item.
    const turns: NegotiationTurn[] = context.negotiationSessions.get(product.id) ?? [];
    turns.push({ from: "buyer", price: proposedPrice, message });

    const seller = await getSellerResponse({
      product,
      buyerOffer: proposedPrice,
      buyerMessage: message,
      turns,
    });
    turns.push({ from: "seller", price: seller.price, message: seller.message });
    context.negotiationSessions.set(product.id, turns);

    return JSON.stringify(
      {
        item_id: product.id,
        seller_decision: seller.decision,
        seller_price: seller.price,
        seller_message: seller.message,
        rounds: Math.ceil(turns.length / 2),
        next_step:
          seller.decision === "accept"
            ? `Acceptance locked at $${seller.price.toFixed(2)} → call create_paypal_order(item_id="${product.id}", amount=${seller.price.toFixed(2)})`
            : "Reply with an improved counter-offer via negotiate_with_seller, or give up by telling the buyer.",
      },
      null,
      2,
    );
  },
};
