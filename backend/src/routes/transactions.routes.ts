/**
 * Transaction endpoints — the audit trail consumed by the Step 3 dashboard.
 *
 * GET  /api/transactions?kind=order|payout&limit=N   → recent transactions
 * POST /api/transactions/:id/approve { note? }      → admin approval (human-in-the-loop)
 * POST /api/transactions/:id/reject  { note? }      → admin rejection
 */
import { Router } from "express";
import { z } from "zod";

import { transactionStore } from "../transactions/transaction-store.js";

export const transactionRoutes = Router();

transactionRoutes.get("/transactions", (req, res) => {
  const kindParam = typeof req.query.kind === "string" ? req.query.kind : undefined;
  const kind = kindParam === "order" || kindParam === "payout" ? kindParam : undefined;
  const limitParam = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;

  const transactions = transactionStore.list({
    kind,
    limit: Number.isFinite(limitParam) ? limitParam : undefined,
  });

  res.json({ count: transactions.length, transactions });
});

const decisionSchema = z.object({ note: z.string().max(500).optional() });

transactionRoutes.post("/transactions/:id/approve", (req, res) => {
  const parsed = decisionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const record = transactionStore.approve(req.params.id, parsed.data.note);
  if (!record) {
    res.status(404).json({
      error: "Transaction not found or not in 'pending_approval' state",
      id: req.params.id,
    });
    return;
  }
  res.json({ transaction: record });
});

transactionRoutes.post("/transactions/:id/reject", (req, res) => {
  const parsed = decisionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const record = transactionStore.reject(req.params.id, parsed.data.note);
  if (!record) {
    res.status(404).json({
      error: "Transaction not found or not in 'pending_approval' state",
      id: req.params.id,
    });
    return;
  }
  res.json({ transaction: record });
});
