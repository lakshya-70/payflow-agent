/**
 * In-memory transaction store — the audit trail the Step 3 dashboard renders.
 *
 * Every order/payout the agents execute lands here with status transitions:
 *
 *   orders:  pending_approval → approved → ordered  (or rejected / failed)
 *   payouts: payout_initiated → payout_completed
 *
 * Swap with SQLite/Postgres later; the storage interface is intentionally tiny.
 */
import { randomUUID } from "node:crypto";

export type TransactionKind = "order" | "payout";

export type TransactionStatus =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "ordered"
  | "paid"
  | "failed"
  | "payout_initiated"
  | "payout_completed";

export interface TransactionRecord {
  id: string;
  kind: TransactionKind;
  /** Which agent performed this (checkout-agent / payout-agent …). */
  agent: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  itemId?: string;
  itemName?: string;
  /** PayPal order id (orders). */
  paypalId?: string;
  /** Payout batch id (payouts). */
  batchId?: string;
  /** Sandbox approval link, when PayPal returns one. */
  approvalUrl?: string;
  /** LLM-generated receipt text (webhook step). */
  receipt?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransactionInput {
  kind: TransactionKind;
  agent: string;
  amount: number;
  currency?: string;
  status?: TransactionStatus;
  itemId?: string;
  itemName?: string;
  note?: string;
}

class TransactionStore {
  private records = new Map<string, TransactionRecord>();

  create(input: CreateTransactionInput): TransactionRecord {
    const now = new Date().toISOString();
    const record: TransactionRecord = {
      id: randomUUID(),
      kind: input.kind,
      agent: input.agent,
      amount: Number(input.amount.toFixed(2)),
      currency: input.currency ?? "USD",
      status: input.status ?? (input.kind === "order" ? "pending_approval" : "payout_initiated"),
      itemId: input.itemId,
      itemName: input.itemName,
      note: input.note,
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(record.id, record);
    return record;
  }

  get(id: string): TransactionRecord | undefined {
    return this.records.get(id);
  }

  list(options: { kind?: TransactionKind; limit?: number } = {}): TransactionRecord[] {
    const all = [...this.records.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const filtered = options.kind ? all.filter((r) => r.kind === options.kind) : all;
    return filtered.slice(0, options.limit ?? 100);
  }

  /** Set PayPal ids/links without changing status. */
  patch(
    id: string,
    patch: Partial<Pick<TransactionRecord, "paypalId" | "batchId" | "approvalUrl" | "note" | "receipt">>,
  ): void {
    const record = this.records.get(id);
    if (!record) return;
    Object.assign(record, patch, { updatedAt: new Date().toISOString() });
  }

  setStatus(id: string, status: TransactionStatus): TransactionRecord | undefined {
    const record = this.records.get(id);
    if (!record) return undefined;
    record.status = status;
    record.updatedAt = new Date().toISOString();
    return record;
  }

  /** Admin approval (human-in-the-loop) — only pending orders can be approved. */
  approve(id: string, note?: string): TransactionRecord | undefined {
    const record = this.records.get(id);
    if (!record || record.status !== "pending_approval") return undefined;
    record.status = "approved";
    record.updatedAt = new Date().toISOString();
    if (note) record.note = note;
    return record;
  }

  reject(id: string, note?: string): TransactionRecord | undefined {
    const record = this.records.get(id);
    if (!record || record.status !== "pending_approval") return undefined;
    record.status = "rejected";
    record.updatedAt = new Date().toISOString();
    if (note) record.note = note;
    return record;
  }

  /**
   * Find an admin-approved order row matching item+amount from the recent
   * window — this is how the agent "picks up" an approval granted in the
   * dashboard after it was told to wait.
   */
  findApprovedOrder(itemId: string, amount: number, windowMs = 15 * 60 * 1000): TransactionRecord | undefined {
    const amountRounded = Number(amount.toFixed(2));
    const now = Date.now();
    return this.list({ kind: "order", limit: 200 }).find(
      (record) =>
        record.status === "approved" &&
        record.itemId?.toLowerCase() === itemId.toLowerCase() &&
        Math.abs(record.amount - amountRounded) < 0.01 &&
        now - new Date(record.createdAt).getTime() <= windowMs,
    );
  }

  clear(): void {
    this.records.clear();
  }
}

export const transactionStore = new TransactionStore();
