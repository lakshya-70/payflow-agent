/** Shared status pill + money/time formatters used across Step 3 components. */
import type { TransactionRecord, TransactionStatus } from "@/lib/api";

export const STATUS_STYLES: Record<TransactionStatus, string> = {
  pending_approval: "bg-amber-400/15 text-amber-300 border-amber-400/40",
  approved: "bg-emerald-400/15 text-emerald-300 border-emerald-400/40",
  rejected: "bg-rose-500/15 text-rose-300 border-rose-500/40",
  ordered: "bg-sky-400/15 text-sky-300 border-sky-400/40",
  paid: "bg-emerald-400/25 text-emerald-200 border-emerald-400/50",
  failed: "bg-rose-500/15 text-rose-300 border-rose-500/40",
  payout_initiated: "bg-violet-400/15 text-violet-300 border-violet-400/40",
  payout_completed: "bg-violet-400/25 text-violet-200 border-violet-400/50",
};

export function StatusPill({ status }: { status: TransactionStatus }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
        STATUS_STYLES[status] ?? "border-flow-line text-slate-400"
      }`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export function formatUsd(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

/** Human-friendly label for the primary PayPal reference of a transaction. */
export function paypalRef(txn: TransactionRecord): string {
  return txn.paypalId ?? txn.batchId ?? "—";
}
