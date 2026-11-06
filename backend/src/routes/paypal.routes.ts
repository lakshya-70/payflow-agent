/**
 * PayPal buyer-side endpoints (Step 3 — dashboard PayPal buttons).
 *
 * GET  /api/paypal/config          → { clientId, environment } — the public
 *                                    credentials the PayPal JS SDK v6 needs to
 *                                    render smart buttons in the dashboard.
 * POST /api/paypal/orders/:id/capture → capture an APPROVED sandbox order
 *                                    (the buyer approved the payment in the
 *                                    PayPal modal → this completes the money
 *                                    movement) and mark the transaction `paid`.
 *
 * Only sandbox, only CAPTURE intent, only for orders this platform created.
 */
import { Router } from "express";

import { env } from "../config/env.js";
import { getPayPalSdk } from "../paypal/paypal-client.js";
import { transactionStore } from "../transactions/transaction-store.js";

export const paypalRoutes = Router();

paypalRoutes.get("/paypal/config", (_req, res) => {
  if (!env.PAYPAL_CLIENT_ID) {
    res.status(503).json({ error: "PayPal client id missing in backend/.env" });
    return;
  }
  res.json({
    clientId: env.PAYPAL_CLIENT_ID,
    environment: env.PAYPAL_ENV,
    currency: "USD",
    intent: "CAPTURE",
  });
});

paypalRoutes.post("/paypal/orders/:id/capture", async (req, res) => {
  const orderId = req.params.id?.trim();
  if (!/^[A-Z0-9]{6,32}$/i.test(orderId)) {
    res.status(400).json({ error: "Invalid PayPal order id" });
    return;
  }

  try {
    const response = await getPayPalSdk().orders.captureOrder({ id: orderId });
    const order = (response as {
      result?: {
        status?: string;
        purchase_units?: Array<{
          payments?: { captures?: Array<{ id?: string; status?: string }> };
        }>;
      };
    }).result;

    // Mirror capture status onto the transaction row so the AG Grid feed
    // shows the full lifecycle: ordered → paid.
    const txn = transactionStore
      .list({ kind: "order", limit: 200 })
      .find((record) => record.paypalId === orderId);
    let transaction = undefined;
    if (txn) {
      const captureId = order?.purchase_units?.[0]?.payments?.captures?.[0]?.id;
      transactionStore.patch(txn.id, captureId ? { note: `capture ${captureId}` } : {});
      transaction = transactionStore.setStatus(txn.id, "paid") ?? txn;
    }

    res.json({
      orderId,
      paypalStatus: order?.status ?? "UNKNOWN",
      transaction,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /credentials missing/i.test(message) ? 503 : 502;
    res.status(status).json({ error: `Capture failed — ${message}` });
  }
});
