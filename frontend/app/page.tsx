"use client";

/**
 * PayFlow Agent — Step 3 dashboard.
 *
 * Layout:
 *   1. Live system snapshot (polled)        — header cards
 *   2. Agent console + trace timeline       — POST /api/agent/chat
 *   3. Admin approval inbox (human-in-loop) — approve/reject pending orders
 *   4. AG Grid transaction feed             — GET /api/transactions (polled)
 *   5. PayPal Smart Buttons payment modal   — pay an order in-context
 */
import { useCallback, useEffect, useState } from "react";

import { fetchHealth, fetchGigs, fetchTransactions, type Gig, type HealthSnapshot, type TransactionRecord } from "@/lib/api";
import { AgentConsole } from "@/components/agent-console";
import { ApprovalsInbox } from "@/components/approvals-inbox";
import { GigPayoutConsole } from "@/components/gig-payout-console";
import { PayOrderModal } from "@/components/pay-order-modal";
import { TransactionsGrid } from "@/components/transactions-grid";

type Phase = "live" | "degraded" | "down" | "loading";

const DOT: Record<Phase, string> = {
  live: "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]",
  degraded: "bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.9)]",
  down: "bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.9)]",
  loading: "bg-slate-500",
};

function StatusDot({ phase }: { phase: Phase }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${DOT[phase]}`} />;
}

function StatusCard({ title, phase, value, detail }: { title: string; phase: Phase; value: string; detail: string }) {
  return (
    <div className="glass-panel p-5 transition-colors hover:border-flow-cyan/40">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-slate-500">{title}</p>
        <StatusDot phase={phase} />
      </div>
      <p className="mt-3 font-display text-xl text-slate-100">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{detail}</p>
    </div>
  );
}

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [backendUp, setBackendUp] = useState<Phase>("loading");
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [paying, setPaying] = useState<TransactionRecord | null>(null);

  const refreshHealth = useCallback(async () => {
    try {
      setHealth(await fetchHealth());
      setBackendUp("live");
    } catch {
      setHealth(null);
      setBackendUp("down");
    }
  }, []);

  const refreshTransactions = useCallback(async () => {
    try {
      setTransactions(await fetchTransactions(120));
    } catch {
      /* keep the last known rows on transient errors */
    }
  }, []);

  const refreshGigs = useCallback(async () => {
    try {
      setGigs(await fetchGigs());
    } catch {
      /* keep the last known gigs on transient errors */
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
    void refreshTransactions();
    void refreshGigs();
    const healthId = setInterval(() => void refreshHealth(), 15_000);
    const txId = setInterval(() => void refreshTransactions(), 8_000);
    return () => {
      clearInterval(healthId);
      clearInterval(txId);
    };
  }, [refreshHealth, refreshTransactions, refreshGigs]);

  const mcpPhase: Phase =
    backendUp === "live"
      ? health?.mcp.state === "ready"
        ? "live"
        : health?.mcp.state === "starting"
          ? "loading"
          : "down"
      : "loading";
  const llmPhase: Phase = backendUp === "live" ? (health?.llm.configured ? "live" : "degraded") : "loading";
  const paypalPhase: Phase =
    backendUp === "live" ? (health?.paypal.credentialsConfigured ? "live" : "degraded") : "loading";

  const pendingCount = transactions.filter((txn) => txn.status === "pending_approval").length;
  const paidCount = transactions.filter((txn) => txn.status === "paid").length;

  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-6xl px-6 py-10">
      {/* Ambient neon glow backdrop */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(1100px_480px_at_18%_-10%,rgba(34,211,238,0.13),transparent),radial-gradient(900px_420px_at_85%_0%,rgba(167,139,250,0.11),transparent)]"
      />

      {/* Top bar */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-400/25 to-violet-500/25 text-cyan-300 shadow-neon">
            ⟨⟩
          </span>
          <div>
            <p className="font-display text-lg leading-none text-slate-100">PayFlow Agent</p>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
              autonomous procurement · paypal sandbox
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <span className="chip border-amber-400/40 text-amber-300">
              <StatusDot phase="degraded" /> {pendingCount} approval{pendingCount > 1 ? "s" : ""} waiting
            </span>
          )}
          <span className="chip text-emerald-300/90">{paidCount} paid</span>
          <span className="chip shadow-neon text-cyan-300/90">sandbox</span>
        </div>
      </header>

      {/* Hero */}
      <section className="mt-12 max-w-3xl">
        <h1 className="font-display text-4xl font-semibold leading-[1.08] text-slate-100 sm:text-5xl">
          Agents that <span className="gradient-text">negotiate, buy</span> and{" "}
          <span className="gradient-text">pay out</span> — under your control.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-slate-400">
          Give the agent a shopping task below. Watch it browse the catalog, negotiate with the seller
          agent, create the PayPal order — approve high-value orders — then pay in-context. Every tool
          call is traced.
        </p>
      </section>

      {/* System snapshot */}
      <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatusCard
          title="Backend API"
          phase={backendUp === "live" ? "live" : backendUp === "down" ? "down" : "loading"}
          value={backendUp === "live" ? `:4000 · ${health?.nodeEnv ?? "—"}` : "offline"}
          detail={
            backendUp === "live"
              ? `uptime ${health?.uptimeSeconds ?? 0}s — express + mcp runtime`
              : "run `npm run dev` from the project root"
          }
        />
        <StatusCard
          title="PayPal MCP"
          phase={mcpPhase}
          value={health ? `${health.mcp.toolCount} tools` : "—"}
          detail={
            health?.mcp.state === "ready"
              ? "official @paypal/mcp server connected over stdio"
              : (health?.mcp.lastError ?? "starting…")
          }
        />
        <StatusCard
          title="LLM"
          phase={llmPhase}
          value={health ? (health.llm.configured ? health.llm.model : "no key") : "—"}
          detail="reasoning + negotiation via OpenAI-compatible API"
        />
        <StatusCard
          title="PayPal REST"
          phase={paypalPhase}
          value={health?.paypal.environment.toUpperCase() ?? "—"}
          detail={health?.paypal.credentialsConfigured ? "sandbox credentials configured" : "add credentials to backend/.env"}
        />
      </section>

      {/* Agent console + approvals */}
      <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_340px]">
        <AgentConsole onTransactionsChanged={() => void refreshTransactions()} />
        <ApprovalsInbox transactions={transactions} onRefresh={() => void refreshTransactions()} />
      </section>

      {/* Freelancer payout pipeline */}
      <section className="mt-10">
        <GigPayoutConsole gigs={gigs} onRefresh={() => void refreshGigs()} />
      </section>

      {/* Transaction feed */}
      <section className="mt-6">
        <TransactionsGrid
          transactions={transactions}
          onPay={(txn) => setPaying(txn)}
        />
      </section>

      <footer className="mt-12 flex flex-wrap items-center justify-between gap-2 border-t border-flow-line pt-5 text-[11px] text-slate-600">
        <span>PayFlow Agent · PayPal AI Hackathon — Step 3 dashboard</span>
        <span>all money movement stays in the PayPal sandbox</span>
      </footer>

      {/* PayPal payment modal */}
      <PayOrderModal
        order={paying}
        onClose={() => setPaying(null)}
        onPaid={() => void refreshTransactions()}
      />
    </main>
  );
}
