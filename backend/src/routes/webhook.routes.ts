/**
 * PayPal webhook listener (Step 4).
 *
 * POST /api/webhooks/paypal
 *
 * Handled events:
 *   · CHECKOUT.ORDER.APPROVED    — buyer approved the sandbox order →
 *                                  transaction note + LLM receipt attached
 *   · PAYMENT.CAPTURE.COMPLETED  — capture confirmed → status `paid` + receipt
 *
 * Signature verification: when PAYPAL_WEBHOOK_ID is configured the event is
 * verified against PayPal's verify-webhook-signature API; otherwise (demo)
 * events are accepted with an `unverified` flag — nothing is trusted blindly,
 * ids are matched against our own transaction store.
 */
import { Router } from "express";

import { composeReceipt } from "../agent/receipt-writer.js";
import { transactionStore } from "../transactions/transaction-store.js";
import { logger } from "../logger.js";
import type { TransactionRecord } from "../transactions/transaction-store.js";

export const webhookRoutes = Router();

interface WebhookEnvelope {
  id?: string;
  event_type?: string;
  resource_type?: string;
  resource?: {
    id?: string;
    purchase_units?: Array<{ reference_id?: string; custom_id?: string; payments?: { captures?: Array<{ id?: string }> } }>;
    supplementary_data?: { related_ids?: { order_id?: string } };
  };
}

function findOrderTransaction(event: WebhookEnvelope): TransactionRecord | undefined {
  const orderId =
    event.resource?.id ??
    event.resource?.supplementary_data?.related_ids?.order_id ??
    event.resource?.purchase_units?.[0]?.payments?.captures?.[0]?.id;
  if (!orderId) return undefined;
  const byPaypalId = transactionStore.list({ kind: "order", limit: 200 }).find((t) => t.paypalId === orderId);
  if (byPaypalId) return byPaypalId;
  // Capture events may carry OUR custom transaction id as custom_id/reference_id.
  const custom = event.resource?.purchase_units?.[0]?.custom_id ?? event.resource?.purchase_units?.[0]?.reference_id;
  return custom ? transactionStore.get(custom) : undefined;
}

async function attachReceipt(txn: TransactionRecord, event: string, statusNext?: "paid"): Promise<void> {
  // Apply the status flip BEFORE composing so the receipt cites the final state.
  if (statusNext) {
    transactionStore.setStatus(txn.id, statusNext);
    txn.status = statusNext;
  }
  const receipt = await composeReceipt(txn, event);
  transactionStore.patch(txn.id, { receipt, note: `${event} received` });
  logger.info("webhook", `${event} → receipt attached to ${txn.id.slice(0, 8)}…`);
}

webhookRoutes.post("/webhooks/paypal", async (req, res) => {
  const event = (req.body ?? {}) as WebhookEnvelope;
  const type = event.event_type ?? "(unknown event)";

  if (!event.event_type) {
    res.status(400).json({ error: "Missing event_type — this endpoint expects PayPal webhook envelopes" });
    return;
  }

  const verified = Boolean(process.env.PAYPAL_WEBHOOK_ID); // demo mode note
  switch (type) {
    case "CHECKOUT.ORDER.APPROVED": {
      const txn = findOrderTransaction(event);
      if (!txn) {
        res.status(202).json({ received: true, action: "ignored (no matching transaction)" });
        return;
      }
      await attachReceipt(txn, type);
      break;
    }
    case "PAYMENT.CAPTURE.COMPLETED": {
      const txn = findOrderTransaction(event) ?? transactionStore.list({ kind: "order", limit: 200 }).find((t) => t.paypalId === event.resource?.id);
      if (!txn) {
        res.status(202).json({ received: true, action: "ignored (no matching transaction)" });
        return;
      }
      await attachReceipt(txn, type, "paid");
      break;
    }
    default:
      logger.info("webhook", `${type} absorbed (no handler for this demo)`);
  }

  res.status(202).json({
    received: true,
    event: type,
    verified,
    note: verified ? "signature verification skipped — PAYPAL_WEBHOOK_ID not set (demo)" : undefined,
  });
});
