"use client";

/**
 * In-context PayPal payment modal (Step 3).
 *
 * Renders the official PayPal Smart Buttons (JS SDK v6 via
 * @paypal/react-paypal-js) for an order the agent already created:
 *   · createOrder returns the EXISTING PayPal order id — no new order
 *   · onApprove → backend POST /api/paypal/orders/:id/capture completes the
 *     money movement and flips the transaction to `paid`
 */
import { useEffect, useState } from "react";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";

import { capturePaypalOrder, fetchPaypalConfig, type PayPalConfig, type TransactionRecord } from "@/lib/api";
import { formatUsd } from "@/components/shared";

type Stage = "config" | "ready" | "capturing" | "done";

export function PayOrderModal({
  order,
  onClose,
  onPaid,
}: {
  order: TransactionRecord | null;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [config, setConfig] = useState<PayPalConfig | null>(null);
  const [stage, setStage] = useState<Stage>("ready");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!order) {
      setStage("ready");
      setError(null);
      setConfig(null);
      return;
    }
    let alive = true;
    setStage("config");
    void fetchPaypalConfig()
      .then((payPal) => {
        if (alive) setConfig(payPal);
      })
      .catch((caught: unknown) => {
        if (alive) setError(caught instanceof Error ? caught.message : "PayPal config unavailable");
      });
    return () => {
      alive = false;
    };
  }, [order]);

  if (!order) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="glass-panel w-full max-w-md overflow-hidden shadow-neon"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Pay with PayPal"
      >
        <div className="flex items-start justify-between border-b border-flow-line px-5 py-4">
          <div>
            <p className="font-display text-slate-100">Complete the purchase</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{order.itemName ?? "PayFlow order"}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-flow-line px-2 py-1 text-xs text-slate-400 transition-colors hover:border-rose-500/40 hover:text-rose-300"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 px-5 py-4 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-600">amount</p>
            <p className="mt-1 font-display text-xl text-flow-cyan">{formatUsd(order.amount, order.currency)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-600">paypal order</p>
            <p className="mt-1 truncate font-mono text-xs text-slate-400" title={order.paypalId}>
              {order.paypalId}
            </p>
          </div>
        </div>

        <div className="px-5 pb-5">
          {stage === "done" ? (
            <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-6 text-center">
              <p className="font-display text-lg text-emerald-300">Payment captured 🎉</p>
              <p className="mt-1 text-xs text-slate-400">
                transaction {order.id.slice(0, 8)}… is now <strong>paid</strong> — the feed refreshed
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 rounded-xl border border-flow-line px-4 py-2 text-xs text-slate-300 transition-colors hover:border-flow-cyan/40 hover:text-flow-cyan"
              >
                close
              </button>
            </div>
          ) : stage === "capturing" ? (
            <div className="rounded-xl border border-flow-cyan/30 bg-flow-cyan/5 px-4 py-6 text-center">
              <p className="animate-pulse font-display text-sm text-flow-cyan">capturing payment…</p>
            </div>
          ) : config ? (
            <PayPalScriptProvider
              options={{
                clientId: config.clientId,
                currency: config.currency,
                intent: config.intent,
                locale: "en_US",
              }}
            >
              <PayPalButtons
                style={{ color: "silver", layout: "vertical", shape: "pill", label: "paypal" }}
                createOrder={async () => order.paypalId ?? ""}
                onApprove={async () => {
                  setStage("capturing");
                  try {
                    await capturePaypalOrder(order.paypalId ?? "");
                    setStage("done");
                    onPaid();
                  } catch (caught) {
                    setStage("ready");
                    setError(caught instanceof Error ? caught.message : "Capture failed");
                  }
                }}
                onError={() => setError("PayPal buttons failed to load — try the direct approval link below")}
              />
            </PayPalScriptProvider>
          ) : (
            <p className="px-1 py-4 text-xs text-slate-500">loading PayPal…</p>
          )}

          {error && (
            <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] leading-relaxed text-rose-200">
              ⚠️ {error}
            </p>
          )}

          {order.approvalUrl && stage !== "done" && (
            <p className="mt-3 text-center text-[11px] text-slate-600">
              or{" "}
              <a href={order.approvalUrl} target="_blank" rel="noreferrer" className="text-flow-cyan/90 underline">
                open the PayPal approval page ↗
              </a>
            </p>
          )}

          <p className="mt-3 text-center text-[10px] text-slate-700">
            sandbox environment — no real money moves
          </p>
        </div>
      </div>
    </div>
  );
}
