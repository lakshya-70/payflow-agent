/**
 * create_paypal_order — finalize a negotiated purchase with a real sandbox order.
 *
 * Flow:
 *   1. Resolve the item in the catalog (guards unknown items).
 *   2. Price sanity: reject below floor (seller wouldn't accept) / above list.
 *   3. Human-in-the-loop gate: orders ≥ PAYFLOW_APPROVAL_THRESHOLD need an
 *      admin approval — the tool creates a `pending_approval` transaction and
 *      tells the agent to have the admin approve; a later call with the same
 *      item+amount picks up the approved transaction.
 *   4. Create the PayPal order (official SDK, CAPTURE intent) and record
 *      paypal id + sandbox approval link + transaction row.
 */
import { CheckoutPaymentIntent } from "@paypal/paypal-server-sdk";

import { findProduct } from "../../catalog/catalog.service.js";
import { env } from "../../config/env.js";
import { logger } from "../../logger.js";
import { getPayPalSdk } from "../../paypal/paypal-client.js";
import { transactionStore } from "../../transactions/transaction-store.js";
import type { AgentTool } from "./types.js";
import { numberArg, stringArg } from "./types.js";

const money = (value: number): number => Math.round(value * 100) / 100;

export const orderTool: AgentTool = {
  name: "create_paypal_order",
  description:
    "Create a SANDBOX PayPal order for an agreed product and price. Call ONLY after the seller accepted. " +
    "Returns the PayPal order id, status, and the sandbox approval link the buyer must open to pay. " +
    "High-value orders may require human admin approval first (the tool will tell you).",
  parameters: {
    type: "object",
    properties: {
      item_id: { type: "string", description: "Product id from get_product_catalog" },
      amount: { type: "number", description: "Final agreed total in USD, e.g. 88.00" },
      reasoning: {
        type: "string",
        description: "One sentence explaining why this price is right — recorded for the admin dashboard",
      },
    },
    required: ["item_id", "amount"],
  },

  async execute(args): Promise<string> {
    const itemId = stringArg(args, "item_id").trim();
    const amount = numberArg(args, "amount");
    const reasoning = stringArg(args, "reasoning").trim();

    const product = findProduct(itemId);
    if (!product) {
      return `ERROR: unknown item_id "${itemId}" — call get_product_catalog first.`;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return "ERROR: amount must be a positive number (USD).";
    }
    const price = money(amount);

    // ── Price sanity (the negotiation contract) ──────────────────────────────
    if (price < product.floorPrice - 0.005) {
      return (
        `ERROR: $${price.toFixed(2)} is below the seller floor ($${product.floorPrice.toFixed(2)}) — the seller ` +
        "would never accept this. Reopen negotiation with negotiate_with_seller or pick another item."
      );
    }
    if (price > product.listPrice + 0.005) {
      return `ERROR: $${price.toFixed(2)} exceeds the list price ($${product.listPrice.toFixed(2)}). Do not overpay — use the agreed/list price.`;
    }

    // ── Human approval gate for high-value purchases ─────────────────────────
    const needsApproval = price >= env.PAYFLOW_APPROVAL_THRESHOLD;
    if (needsApproval) {
      const approved = transactionStore.findApprovedOrder(product.id, price);
      if (!approved) {
        const record = transactionStore.create({
          kind: "order",
          agent: "checkout-agent",
          amount: price,
          itemId: product.id,
          itemName: product.name,
          status: "pending_approval",
          note: reasoning ? `Agent reasoning: ${reasoning}` : undefined,
        });
        return JSON.stringify(
          {
            status: "ADMIN_APPROVAL_REQUIRED",
            transaction_id: record.id,
            item: product.name,
            amount: price,
            threshold: env.PAYFLOW_APPROVAL_THRESHOLD,
            instruction:
              "This high-value order needs a human. Ask the user/admin to approve transaction " +
              `${record.id} in the PayFlow dashboard, then call create_paypal_order again with the same parameters.`,
          },
          null,
          2,
        );
      }
    }

    // ── Create the PayPal order (official SDK) ───────────────────────────────
    const withoutApproval = needsApproval
      ? transactionStore.findApprovedOrder(product.id, price)!
      : transactionStore.create({
          kind: "order",
          agent: "checkout-agent",
          amount: price,
          status: "approved",
          itemId: product.id,
          itemName: product.name,
          note: reasoning ? `Agent reasoning: ${reasoning}` : undefined,
        });

    try {
      const response = await getPayPalSdk().orders.createOrder({
        body: {
          intent: CheckoutPaymentIntent.Capture,
          purchaseUnits: [
            {
              customId: withoutApproval.id,
              description: `PayFlow Agent purchase: ${product.name}`.slice(0, 127),
              amount: {
                currencyCode: "USD",
                value: price.toFixed(2),
                breakdown: { itemTotal: { currencyCode: "USD", value: price.toFixed(2) } },
              },
              items: [
                {
                  name: product.name.slice(0, 127),
                  quantity: "1",
                  unitAmount: { currencyCode: "USD", value: price.toFixed(2) },
                  description: product.description.slice(0, 200),
                },
              ],
            },
          ],
        },
      });

      // ApiResponse<T>.result — kept loosely typed to tolerate minor SDK updates.
      const order = (response as { result?: { id?: string; status?: string; links?: Array<{ rel?: string; href?: string }> } }).result;
      const approvalUrl = order?.links?.find((link) => link.rel === "approve")?.href;

      transactionStore.patch(withoutApproval.id, {
        paypalId: order?.id,
        approvalUrl,
      });
      transactionStore.setStatus(withoutApproval.id, "ordered");

      logger.info("order-tool", `paypal order ${order?.id} — ${product.name} @ $${price.toFixed(2)}`);
      return JSON.stringify(
        {
          transaction_id: withoutApproval.id,
          paypal_order_id: order?.id,
          paypal_status: order?.status,
          item: product.name,
          amount: price,
          approval_url: approvalUrl ?? null,
          buying_instructions:
            "Give the buyer this sandbox approval link. They should open it and pay using a SANDBOX personal account. " +
            "You can later check status with the MCP tool get_order.",
        },
        null,
        2,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      transactionStore.setStatus(withoutApproval.id, "failed");
      if (message) transactionStore.patch(withoutApproval.id, { note: message.slice(0, 200) });
      logger.error("order-tool", `paypal create failed: ${message}`);
      return `TOOL_ERROR: PayPal order creation failed — ${message}`;
    }
  },
};
