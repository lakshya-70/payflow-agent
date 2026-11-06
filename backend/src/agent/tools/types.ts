/**
 * Types shared by PayFlow agent tools.
 *
 * Each tool is an OpenAI-tool-compatible definition plus an `execute` function.
 * The registry (tools/registry.ts) merges these with the PayPal MCP server's
 * tools, giving the checkout agent one unified tool set:
 *
 *   PayFlow tools : get_product_catalog · negotiate_with_seller ·
 *                   create_paypal_order · execute_paypal_payout
 *   MCP (PayPal)  : get_order · list_transactions · create_refund · invoices · …
 */
import type { NegotiationTurn } from "../seller-agent.js";

export interface AgentToolContext {
  /** Per-agent-turn negotiation sessions, keyed by productId. */
  negotiationSessions: Map<string, NegotiationTurn[]>;
}

export interface AgentTool {
  /** OpenAI-valid tool name (^[a-zA-Z0-9_-]{1,64}$). */
  name: string;
  description: string;
  /** JSON Schema for the `parameters` field. */
  parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>, context: AgentToolContext): Promise<string>;
}

/** Read a required numeric arg; returns NaN when absent/invalid. */
export function numberArg(args: Record<string, unknown>, key: string): number {
  const raw = args[key];
  return typeof raw === "number" ? raw : Number(raw);
}

/** Read a required string arg. */
export function stringArg(args: Record<string, unknown>, key: string): string {
  const raw = args[key];
  return typeof raw === "string" ? raw : raw == null ? "" : String(raw);
}
