"use client";

/**
 * Gig payout console (Step 4) — the automated freelancer payout pipeline.
 *
 * Flow per gig:
 *   open → [mark work submitted] → submitted
 *        → [LLM quality review]  → approved | rejected
 *        → [release payout]      → paid (PayPal Payouts — or a clearly-labeled
 *                                  simulated batch when PAYOUTS_MODE=mock,
 *                                  e.g. India sender accounts)
 */
import { useState } from "react";

import { payoutGig, reviewGig, submitGig, type Gig } from "@/lib/api";
import { formatUsd } from "@/components/shared";

const GIG_STYLES: Record<Gig["status"], string> = {
  open: "bg-slate-400/10 text-slate-400 border-slate-400/30",
  submitted: "bg-amber-400/15 text-amber-300 border-amber-400/40",
  approved: "bg-emerald-400/15 text-emerald-300 border-emerald-400/40",
  rejected: "bg-rose-500/15 text-rose-300 border-rose-500/40",
  paid: "bg-violet-400/20 text-violet-200 border-violet-400/50",
};

function GigRow({
  gig,
  onAction,
  busy,
}: {
  gig: Gig;
  onAction: (id: string, action: "submit" | "review" | "payout", summary?: string) => void;
  busy: boolean;
}) {
  const [summary, setSummary] = useState(gig.summary ?? "");
  const [showComposer, setShowComposer] = useState(false);

  return (
    <div className="glass-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-display text-sm text-slate-200">{gig.title}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {gig.freelancer} · {gig.email} · deal {formatUsd(gig.amount)}
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${GIG_STYLES[gig.status]}`}>
          {gig.status}
        </span>
      </div>

      <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{gig.description}</p>

      {/* Review verdict / payout status */}
      {gig.reviewReason && (
        <p className="mt-2 rounded-lg bg-black/25 px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-400">
          {gig.reviewReason}
        </p>
      )}
      {gig.batchId && (
        <p className="mt-1.5 text-[11px] text-flow-cyan/80">
          batch <code>{gig.batchId}</code>
          {gig.batchId.startsWith("payflow-mock") && <span className="ml-1 text-violet-300">· simulated</span>}
        </p>
      )}

      {/* Composer for submit */}
      {showComposer && gig.status === "open" && (
        <div className="mt-3">
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            rows={2}
            placeholder="Work summary: what was delivered, links, key notes — the LLM reviews this text."
            className="w-full resize-none rounded-xl border border-flow-line bg-black/30 px-3 py-2 text-xs text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-flow-cyan/50"
          />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {gig.status === "open" && !showComposer && (
          <button
            type="button"
            onClick={() => setShowComposer(true)}
            className="rounded-lg border border-flow-cyan/40 bg-flow-cyan/10 px-3 py-1.5 text-xs font-medium text-flow-cyan transition-colors hover:bg-flow-cyan/20"
          >
            Mark work submitted
          </button>
        )}
        {gig.status === "open" && showComposer && (
          <button
            type="button"
            disabled={busy || summary.trim().length < 4}
            onClick={() => {
              setShowComposer(false);
              onAction(gig.id, "submit", summary.trim());
            }}
            className="rounded-lg border border-flow-cyan/40 bg-flow-cyan/15 px-3 py-1.5 text-xs font-medium text-flow-cyan transition-colors hover:bg-flow-cyan/25 disabled:opacity-40"
          >
            Submit for review
          </button>
        )}
        {gig.status === "submitted" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(gig.id, "review")}
            className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-400/20 disabled:opacity-40"
          >
            Run LLM review 🔍
          </button>
        )}
        {gig.status === "approved" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(gig.id, "payout")}
            className="rounded-lg border border-violet-400/40 bg-violet-400/10 px-3 py-1.5 text-xs font-medium text-violet-300 transition-colors hover:bg-violet-400/20 disabled:opacity-40"
          >
            Release payout 💸
          </button>
        )}
        {gig.status === "rejected" && (
          <span className="text-[11px] text-rose-300/80">payout blocked — resubmit the work in a new demo run</span>
        )}
        {gig.status === "paid" && (
          <span className="text-[11px] text-emerald-300/80">payout released — see the transaction feed</span>
        )}
      </div>
    </div>
  );
}

export function GigPayoutConsole({ gigs, onRefresh }: { gigs: Gig[]; onRefresh: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, action: "submit" | "review" | "payout", summary?: string) {
    setBusyId(id);
    setError(null);
    try {
      if (action === "submit") await submitGig(id, summary ?? "");
      if (action === "review") await reviewGig(id);
      if (action === "payout") await payoutGig(id);
      onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gig action failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <p className="font-display text-lg text-slate-100">Freelancer payouts</p>
          <span className="chip text-[10px]">agent-verified · human-approved pipeline</span>
        </div>
        <p className="text-[11px] text-slate-600">
          submit → LLM review → payout {gigs.some((gig) => gig.batchId?.startsWith("payflow-mock")) && "· mock mode 🏷️"}
        </p>
      </div>

      {error && <p className="mx-1 mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">⚠️ {error}</p>}

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {gigs.map((gig) => (
          <GigRow key={gig.id} gig={gig} busy={busyId === gig.id} onAction={(id, action, summary) => void act(id, action, summary)} />
        ))}
      </div>
    </div>
  );
}
