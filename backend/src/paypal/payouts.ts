/**
 * PayPal Payouts).
 *
 * ⚠️  The `@paypal/paypal-server-sdk` (v2.5) does not ship a payouts controller
 * (orders/payments/subscriptions/search/vault only), so we call the documented
 * Payouts REST endpoint directly, using the same sandbox access token the MCP
 * server uses (see paypal/token-manager.ts).
 *
 * Docs: https://developer.paypal.com/docs/payouts/
 *       POST /v1/payments/payouts  (synchronous create · status: SUCCESS w/ batch header)
 *
 * Sandbox tip: if PayPal answers that the Payouts platform is unavailable,
 * enable the "Payouts" feature for your app in the developer dashboard
 * (Apps & Credentials → your sandbox app → Payouts).
 */
import { env } from "../config/env.js";
import { logger } from "../logger.js";
import { paypalApiBaseUrl, tokenManager } from "./token-manager.js";

export interface PayoutRequest {
  receiverEmail: string;
  amountUsd: number;
  note?: string;
}

export interface PayoutResult {
  batchId: string;
  batchStatus: string;
  senderBatchId: string;
  receiver: string;
  amountUsd: number;
  /** true when PAYOUTS_MODE=mock produced a simulated (clearly-labeled) payout. */
  simulated?: boolean;
}

/** POST /v1/payments/payouts — creates a single-item payout batch. */
export async function sendPayPalPayout(request: PayoutRequest): Promise<PayoutResult> {
  // Simulated landscape: PayPal does not serve Payouts senders in every country
  // (e.g. India). When PAYOUTS_MODE=mock we produce a clearly-tagged simulated
  // batch instead of touching the REST API — no money claim is implied.
  if (env.PAYOUTS_MODE === "mock") {
    const senderBatchId = `payflow-mock-${Date.now().toString(36)}`;
    logger.warn("payouts", `simulated payout (${senderBatchId}) — PAYOUTS_MODE=mock`);
    return {
      batchId: senderBatchId,
      batchStatus: "PENDING",
      senderBatchId,
      receiver: request.receiverEmail,
      amountUsd: request.amountUsd,
      simulated: true,
    };
  }

  const token = await tokenManager.getToken();
  const senderBatchId = `payflow-payout-${Date.now().toString(36)}`;
  const amountValue = request.amountUsd.toFixed(2);

  const body = {
    sender_batch_header: {
      sender_batch_id: senderBatchId,
      email_subject: "You have a payout!",
      email_message: request.note ?? "Automated gig payout from PayFlow Agent (sandbox).",
    },
    items: [
      {
        recipient_type: "EMAIL",
        receiver: request.receiverEmail,
        amount: { value: amountValue, currency: "USD" },
        note: request.note ?? "PayFlow Agent automated payout",
        sender_item_id: `${senderBatchId}-item-1`,
      },
    ],
  };

  const response = await fetch(`${paypalApiBaseUrl()}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Partner-Attribution-Id": "PayFlow_Agent_SDK_BT",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as
      | { name?: string; message?: string; details?: Array<{ issue?: string; description?: string }> }
      | null;
    const message =
      error?.details?.map((detail) => `${detail.issue}: ${detail.description}`).join("; ") ??
      error?.message ??
      `HTTP ${response.status}`;
    throw new Error(payoutsHintFor(message));
  }

  const data = (await response.json()) as {
    batch_header?: { payout_batch_id?: string; batch_status?: string };
  };
  const batchId = data.batch_header?.payout_batch_id ?? `local-${senderBatchId}`;
  const batchStatus = data.batch_header?.batch_status ?? "UNKNOWN";

  return {
    batchId,
    batchStatus,
    senderBatchId,
    receiver: request.receiverEmail,
    amountUsd: request.amountUsd,
  };
}

/** Turn classic Payouts sandbox pitfalls into actionable error messages. */
function payoutsHintFor(message: string): string {
  if (/platform is not available|NOT_AUTHORIZED|unauthorized/i.test(message)) {
    return `${message} — tip: enable the Payouts feature for your sandbox app in the PayPal developer dashboard (Apps & Credentials → your app → Payouts).`;
  }
  return message;
}
