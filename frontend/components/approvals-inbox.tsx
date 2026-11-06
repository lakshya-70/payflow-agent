"use client";

/**
 * Admin approval inbox (human-in-the-loop).
 *
 * Orders at/above PAYFLOW_APPROVAL_THRESHOLD pause as `pending_approval`.
 * The admin approves/rejects here; the agent picks the approval up on its
 * next create_paypal_order call with the same item + amount.
 */
import { useState } from "react";

import { approveTransaction, rejectTransaction, type TransactionRecord } from "@/lib/api";
import { StatusPill, formatTime, formatUsd } from "@/components/shared";

export function ApprovalsInbox({
  transactions,
  onRefresh,
}: {
  transactions: TransactionRecord[];
  onRefresh: () => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banners, setBanners] = useState<Record<string, string>>({});

  const pending = transactions.filter((txn) => txn.status === "pending_approval");

  async function decide(txn: TransactionRecord, approve: boolean) {
    setPendingId(txn.id);
    setError(null);
    try {
      await (approve ? approveTransaction(txn.id) : rejectTransaction(txn.id));
      setBanners((current) => ({
        ...current,
        [txn.id]: approve
          ? "approved — ask the agent again and it will complete the order"
          : "rejected — the agent is told the order is dead and picks another plan",
      }));
      onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Decision failed");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="glass-panel flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-flow-line px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-amber-400/15 text-[11px] text-amber-300">
            ✓
          </span>
          <p className="font-display text-sm text-slate-200">Approval inbox</p>
        </div>
        <span className="chip text-[10px]">{pending.length} waiting</span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {pending.length === 0 && (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="font-display text-slate-400">Nothing needs you</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                the agent asks for approval only on orders at/above your
                <br />
                PAYFLOW_APPROVAL_THRESHOLD — everything below it flows automatically
              </p>
            </div>
          </div>
        )}

        {pending.map((txn) => (
          <div key={txn.id} className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-200">{txn.itemName ?? "Order"}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatUsd(txn.amount, txn.currency)} · {formatTime(txn.createdAt)}
                </p>
              </div>
              <StatusPill status={txn.status} />
            </div>
            {txn.note && (
              <p className="mt-2 rounded-lg bg-black/25 px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-400">
                {txn.note}
              </p>
            )}
            {banners[txn.id] ? (
              <p className="mt-2.5 text-[11px] text-emerald-300">✓ {banners[txn.id]}</p>
            ) : (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={pendingId === txn.id}
                  onClick={() => void decide(txn, true)}
                  className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-400/20 disabled:opacity-40"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={pendingId === txn.id}
                  onClick={() => void decide(txn, false)}
                  className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/15 disabled:opacity-40"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        ))}

        {error && <p className="text-[11px] text-rose-300">⚠️ {error}</p>}
      </div>
    </div>
  );
}
