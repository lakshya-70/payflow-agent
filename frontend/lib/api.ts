/**
 * Typed client for the PayFlow backend API (Step 3 dashboard).
 *
 * Backend base URL defaults to the local Express dev server; override with
 * NEXT_PUBLIC_API_URL when the backend is deployed (e.g. on Render).
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/* ─────────────────────────── shared types ─────────────────────────── */

export interface HealthSnapshot {
  ok: boolean;
  service: string;
  nodeEnv: string;
  uptimeSeconds: number;
  paypal: { environment: string; credentialsConfigured: boolean };
  mcp: { state: "idle" | "starting" | "ready" | "error"; toolCount: number; lastError: string | null };
  llm: { configured: boolean; model: string };
}

export interface CatalogProduct {
  id: string;
  name: string;
  category: string;
  description: string;
  listPrice: number;
  floorPrice: number;
  currency: string;
  stock: number;
  negotiable: boolean;
}

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
  kind: "order" | "payout";
  agent: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  itemId?: string;
  itemName?: string;
  paypalId?: string;
  batchId?: string;
  approvalUrl?: string;
  note?: string;
  receipt?: string;
  createdAt: string;
  updatedAt: string;
}

export type GigStatus = "open" | "submitted" | "approved" | "rejected" | "paid";

export interface Gig {
  id: string;
  title: string;
  description: string;
  freelancer: string;
  email: string;
  amount: number;
  status: GigStatus;
  summary?: string;
  reviewReason?: string;
  batchId?: string;
  transactionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentTraceStep {
  step: number;
  tool: string;
  args: Record<string, unknown>;
  resultPreview: string;
  durationMs: number;
}

export interface AgentChatResponse {
  reply: string;
  trace: AgentTraceStep[];
}

export interface PayPalConfig {
  clientId: string;
  environment: "sandbox" | "production";
  currency: string;
  intent: string;
}

export interface CaptureResponse {
  orderId: string;
  paypalStatus: string;
  transaction?: TransactionRecord;
}

/* ─────────────────────────── fetch helpers ─────────────────────────── */

async function json<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `${init?.method ?? "GET"} ${String(input)} failed (${res.status})`);
  }
  return (await res.json()) as T;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  return json<T>(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

/* ───────────────────────────── endpoints ───────────────────────────── */

export async function fetchHealth(): Promise<HealthSnapshot> {
  return json<HealthSnapshot>(`${API_BASE}/api/health`, { cache: "no-store" });
}

export async function fetchCatalog(): Promise<CatalogProduct[]> {
  const data = await json<{ count: number; products: CatalogProduct[] }>(`${API_BASE}/api/catalog`);
  return data.products;
}

export async function fetchTransactions(limit = 100): Promise<TransactionRecord[]> {
  const data = await json<{ count: number; transactions: TransactionRecord[] }>(
    `${API_BASE}/api/transactions?limit=${limit}`,
  );
  return data.transactions;
}

export async function sendAgentChat(
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<AgentChatResponse> {
  return post<AgentChatResponse>("/api/agent/chat", { message, history });
}

export async function approveTransaction(id: string, note?: string): Promise<TransactionRecord> {
  const data = await post<{ transaction: TransactionRecord }>(`/api/transactions/${id}/approve`, { note });
  return data.transaction;
}

export async function rejectTransaction(id: string, note?: string): Promise<TransactionRecord> {
  const data = await post<{ transaction: TransactionRecord }>(`/api/transactions/${id}/reject`, { note });
  return data.transaction;
}

export async function fetchPaypalConfig(): Promise<PayPalConfig> {
  return json<PayPalConfig>(`${API_BASE}/api/paypal/config`);
}

export async function capturePaypalOrder(orderId: string): Promise<CaptureResponse> {
  return post<CaptureResponse>(`/api/paypal/orders/${orderId}/capture`);
}

/* ───────────────────────── gig payout console ───────────────────────── */

export async function fetchGigs(): Promise<Gig[]> {
  const data = await json<{ count: number; gigs: Gig[] }>(`${API_BASE}/api/gigs`);
  return data.gigs;
}

export async function submitGig(id: string, summary: string): Promise<Gig> {
  const data = await post<{ gig: Gig }>(`/api/gigs/${id}/submit`, { summary });
  return data.gig;
}

export async function reviewGig(id: string): Promise<Gig> {
  const data = await post<{ gig: Gig }>(`/api/gigs/${id}/review`);
  return data.gig;
}

export async function payoutGig(id: string): Promise<{ gig: Gig; payout: { simulated?: boolean; batchId?: string } }> {
  return post<{ gig: Gig; payout: { simulated?: boolean; batchId?: string } }>(`/api/gigs/${id}/payout`);
}
