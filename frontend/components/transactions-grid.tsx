"use client";

/**
 * AG Grid transaction feed (Step 3).
 *
 * Live audit trail of every order/payout the agents execute — status pills,
 * agent reasoning notes and PayPal references, with a neon-dark theme built
 * through AG Grid's theming API (no external stylesheet needed).
 */
import { useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { themeQuartz, type ColDef, type ICellRendererParams } from "ag-grid-community";

import type { TransactionRecord } from "@/lib/api";
import { StatusPill, formatTime, formatUsd, paypalRef } from "@/components/shared";

const gridTheme = themeQuartz.withParams({
  accentColor: "#22d3ee",
  backgroundColor: "#0b1020",
  foregroundColor: "#cbd5e1",
  headerTextColor: "#94a3b8",
  headerBackgroundColor: "#0d1224",
  oddRowBackgroundColor: "#0a0e1c",
  borderColor: "rgba(148, 163, 184, 0.14)",
  fontFamily: "inherit",
  fontSize: 12.5,
  headerFontSize: 10.5,
  headerFontWeight: 600,
  rowBorder: { style: "solid", color: "rgba(148, 163, 184, 0.07)", width: 1 },
  wrapperBorderRadius: 16,
  rowHoverColor: "rgba(34, 211, 238, 0.05)",
  selectedRowBackgroundColor: "rgba(167, 139, 250, 0.12)",
});

function KindCell({ value }: ICellRendererParams) {
  const kind = value as "order" | "payout";
  return (
    <span className="text-[11px] font-medium uppercase tracking-wider">
      <span className={kind === "order" ? "text-sky-300/80" : "text-violet-300/80"}>{kind}</span>
    </span>
  );
}

function StatusCell(params: ICellRendererParams) {
  return <StatusPill status={params.value} />;
}

export function TransactionsGrid({
  transactions,
  onPay,
  onOpenApproval,
}: {
  transactions: TransactionRecord[];
  onPay: (txn: TransactionRecord) => void;
  onOpenApproval?: (txn: TransactionRecord) => void;
}) {
  const [quickFilter, setQuickFilter] = useState("");

  const columnDefs = useMemo<ColDef<TransactionRecord>[]>(
    () => [
      {
        field: "createdAt",
        headerName: "Time",
        width: 84,
        valueFormatter: (params) => formatTime(String(params.value ?? "")),
        sortable: true,
        sort: "desc",
      },
      {
        field: "kind",
        headerName: "Type",
        width: 88,
        cellRenderer: KindCell,
      },
      {
        field: "status",
        headerName: "Status",
        width: 156,
        cellRenderer: StatusCell,
        floatingFilter: false,
      },
      {
        field: "amount",
        headerName: "Amount",
        width: 112,
        type: "rightAligned",
        valueFormatter: (params) => formatUsd(Number(params.value ?? 0), params.data?.currency ?? "USD"),
        comparator: (a, b) => Number(a) - Number(b),
      },
      {
        headerName: "Item / Payout",
        cellRenderer: (params: ICellRendererParams<TransactionRecord>) => {
          const txn = params.data;
          if (!txn) return null;
          return (
            <span className="block truncate text-slate-300" title={txn.itemName ?? txn.note ?? ""}>
              {txn.kind === "order"
                ? txn.itemName ?? txn.itemId ?? "—"
                : `payout${txn.batchId ? ` · ${txn.batchId}` : ""}`}
            </span>
          );
        },
        flex: 1,
        minWidth: 180,
      },
      {
        field: "agent",
        headerName: "Agent",
        width: 132,
        tooltipValueGetter: (p) => String(p.value ?? ""),
      },
      {
        headerName: "Agent reasoning / note",
        flex: 2,
        minWidth: 220,
        tooltipValueGetter: (p) => String(p.data?.receipt ?? p.value ?? ""),
        cellRenderer: (params: ICellRendererParams<TransactionRecord>) => {
          const txn = params.data;
          if (!txn) return null;
          const text = txn.receipt ?? txn.note;
          if (text) {
            return (
              <span className="block truncate text-slate-500" title={`🧾 ${txn.receipt ?? ""}\n${txn.note ?? ""}`}>
                {txn.receipt ? "🧾 " : ""}
                {text}
              </span>
            );
          }
          return null;
        },
      },
      {
        headerName: "PayPal",
        width: 200,
        cellRenderer: (params: ICellRendererParams<TransactionRecord>) => {
          const txn = params.data;
          if (!txn) return null;
          const ref = paypalRef(txn);
          if (ref === "—") return <span className="text-slate-700">—</span>;
          return <code className="text-[11px] text-flow-cyan/80">{ref}</code>;
        },
      },
      {
        headerName: "Action",
        width: 128,
        sortable: false,
        resizable: false,
        cellRenderer: (params: ICellRendererParams<TransactionRecord>) => {
          const txn = params.data;
          if (!txn) return null;
          if (txn.paypalId && (txn.status === "ordered" || txn.status === "failed")) {
            return (
              <button
                type="button"
                onClick={() => onPay(txn)}
                className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 transition-colors hover:bg-emerald-400/20"
              >
                Pay now
              </button>
            );
          }
          if (txn.approvalUrl) {
            return (
              <a
                href={txn.approvalUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-flow-line px-2.5 py-1 text-[11px] text-slate-300 transition-colors hover:border-flow-cyan/40 hover:text-flow-cyan"
              >
                Open link ↗
              </a>
            );
          }
          return <span className="text-slate-700">—</span>;
        },
      },
    ],
    [onPay],
  );

  return (
    <div className="glass-panel overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-flow-line px-5 py-3.5">
        <div className="flex items-center gap-3">
          <p className="font-display text-sm text-slate-200">Transaction feed</p>
          <span className="chip text-[10px]">{transactions.length} events</span>
        </div>
        <input
          value={quickFilter}
          onChange={(event) => setQuickFilter(event.target.value)}
          placeholder="filter… (keyboard, paid, payout)"
          className="h-8 w-56 rounded-lg border border-flow-line bg-black/30 px-3 text-xs text-slate-300 outline-none transition-colors placeholder:text-slate-600 focus:border-flow-cyan/50"
        />
      </div>

      {/* Grid / empty state */}
      {transactions.length === 0 ? (
        <div className="grid h-40 place-items-center px-6 text-center">
          <div>
            <p className="font-display text-slate-400">No transactions yet</p>
            <p className="mt-1 text-xs text-slate-600">
              run the agent — every order, approval and payout lands here live
            </p>
          </div>
        </div>
      ) : (
        <div className="h-[420px] w-full">
          <AgGridReact<TransactionRecord>
            theme={gridTheme}
            rowData={transactions}
            columnDefs={columnDefs}
            getRowId={(params) => String(params.data.id)}
            quickFilterText={quickFilter}
            defaultColDef={{ sortable: true, resizable: true, suppressHeaderMenuButton: true }}
            animateRows={false}
            suppressCellFocus
            suppressDragLeaveHidesColumns
            tooltipShowDelay={250}
          />
        </div>
      )}
    </div>
  );
}
