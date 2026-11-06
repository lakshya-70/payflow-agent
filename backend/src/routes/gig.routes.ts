/**
 * Freelancer gig endpoints (Step 4 — automated payout pipeline).
 *
 * GET  /api/gigs                  → gig list
 * POST /api/gigs/:id/submit       { summary }   — manager submits work for review
 * POST /api/gigs/:id/review       — LLM quality gate → approved | rejected
 * POST /api/gigs/:id/payout       — approved gig → PayPal payout (or simulated
 *                                   batch when PAYOUTS_MODE=mock)
 */
import { Router } from "express";
import { z } from "zod";

import { gigStore, type Gig } from "../gigs/gig-store.js";
import { reviewGigQuality } from "../gigs/quality-review.js";
import { runPayout } from "../agent/tools/payout-service.js";

export const gigRoutes = Router();

/** Serialise a gig for the UI (camelCase, compact). */
function gigView(gig: Gig) {
  return {
    id: gig.id,
    title: gig.title,
    description: gig.description,
    freelancer: gig.freelancer,
    email: gig.email,
    amount: gig.amount,
    status: gig.status,
    summary: gig.summary,
    reviewReason: gig.reviewReason,
    batchId: gig.batchId,
    transactionId: gig.transactionId,
    createdAt: gig.createdAt,
    updatedAt: gig.updatedAt,
  };
}

gigRoutes.get("/gigs", (_req, res) => {
  const gigs = gigStore.list();
  res.json({ count: gigs.length, gigs: gigs.map(gigView) });
});

const submitSchema = z.object({ summary: z.string().min(1).max(4000) });

gigRoutes.post("/gigs/:id/submit", (req, res) => {
  const parsed = submitSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Provide a { summary } of the submitted work", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const gig = gigStore.transition(req.params.id, "submitted", { summary: parsed.data.summary });
  if (!gig) {
    res.status(409).json({ error: "Gig not found or not in 'open' state" });
    return;
  }
  res.json({ gig: gigView(gig) });
});

gigRoutes.post("/gigs/:id/review", async (req, res) => {
  const gig = gigStore.get(req.params.id);
  if (!gig || gig.status !== "submitted") {
    res.status(409).json({ error: "Gig not found or not in 'submitted' state" });
    return;
  }

  // LLM quality gate: approve | reject + reason.
  const review = await reviewGigQuality(gig, gig.summary ?? "");
  const next: "approved" | "rejected" = review.decision === "approve" ? "approved" : "rejected";
  const updated = gigStore.transition(gig.id, next, {
    reviewReason: `${review.decision === "approve" ? "✓" : "✕"} ${review.reason}${review.heuristic ? " (heuristic)" : ` · confidence ${review.confidence.toFixed(2)}`}`,
  });
  if (!updated) {
    res.status(500).json({ error: "Transition failed" });
    return;
  }
  res.json({ gig: gigView(updated), review });
});

gigRoutes.post("/gigs/:id/payout", async (req, res) => {
  const gig = gigStore.get(req.params.id);
  if (!gig || gig.status !== "approved") {
    res.status(409).json({ error: "Gig not found or not in 'approved' state — run the review first" });
    return;
  }

  const outcome = await runPayout({
    email: gig.email,
    amount: gig.amount,
    note: `Gig payout: ${gig.title}`,
    reasoning: gig.reviewReason,
  });

  if (!outcome.ok) {
    // Payout failed (e.g. platform unavailable) — gig stays approved for retry.
    res.status(502).json({ error: outcome.error, gig: gigView(gig) });
    return;
  }

  const updated = gigStore.transition(gig.id, "paid", {
    transactionId: outcome.transactionId,
    batchId: outcome.batchId,
    reviewReason: `${gig.reviewReason ?? ""} · payout ${outcome.simulated ? "SIMULATED" : outcome.batchId}`,
  });
  res.json({
    gig: updated ? gigView(updated) : gigView(gig),
    payout: {
      transactionId: outcome.transactionId,
      batchId: outcome.batchId,
      batchStatus: outcome.batchStatus,
      simulated: Boolean(outcome.simulated),
    },
  });
});
