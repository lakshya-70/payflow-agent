/**
 * Freelancer gig store (Step 4) — the automated payout pipeline.
 *
 * Lifecycle:
 *   open → submitted (manager marks work in) → approved|rejected
 *        (LLM quality review) → paid (PayPal payout batch / simulated)
 *
 * In-memory like the rest of the demo stores; the shape mirrors the
 * transaction store so both plug into a DB later without UI changes.
 */
import { randomUUID } from "node:crypto";

export type GigStatus = "open" | "submitted" | "approved" | "rejected" | "paid";

export interface Gig {
  id: string;
  title: string;
  /** Deliverable spec the agent/LLM reviews the work against. */
  description: string;
  /** Freelancer display name. */
  freelancer: string;
  /** PayPal payout receiver. */
  email: string;
  /** Agreed payout amount (USD). */
  amount: number;
  status: GigStatus;
  /** Work summary the manager attached when submitting the deliverable. */
  summary?: string;
  /** LLM review verdict + reason. */
  reviewReason?: string;
  /** Linked transaction / payout batch once money moves. */
  transactionId?: string;
  batchId?: string;
  createdAt: string;
  updatedAt: string;
}

class GigStore {
  private records = new Map<string, Gig>();

  constructor() {
    const now = new Date().toISOString();
    const seeds: Array<Omit<Gig, "id" | "status" | "createdAt" | "updatedAt">> = [
      {
        title: "Landing page hero section",
        description: "Responsive hero with headline, sub-copy and CTA; ships as HTML/CSS snippet.",
        freelancer: "Priya",
        email: "priya.dev@example.com",
        amount: 120,
      },
      {
        title: "Integration test suite for checkout API",
        description: "Vitest/Superset tests covering order create/approve/capture happy paths + failure paths.",
        freelancer: "Aarav",
        email: "aarav.s@example.com",
        amount: 85,
      },
      {
        title: "Figma icon set refresh (24 icons)",
        description: "Redesigned icon set on 16px grid, exported SVG + PNG @2x, tokens matching brand palette.",
        freelancer: "Mei",
        email: "mei.wu@example.com",
        amount: 60,
      },
      {
        title: "Technical blog: 'PayPal sandbox for agents'",
        description: "800–1200 word article covering sandbox credentials, MCP tools and payout testing.",
        freelancer: "Jules",
        email: "jules.pearson@example.com",
        amount: 150,
      },
    ];
    for (const seed of seeds) {
      const gig: Gig = { ...seed, id: randomUUID(), status: "open", createdAt: now, updatedAt: now };
      this.records.set(gig.id, gig);
    }
  }

  list(): Gig[] {
    return [...this.records.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): Gig | undefined {
    return this.records.get(id);
  }

  /** Mutate a gig through a transition; returns undefined for illegal transitions. */
  transition(id: string, next: GigStatus, extra?: Partial<Gig>): Gig | undefined {
    const gig = this.records.get(id);
    if (!gig) return undefined;
    const allowed: Partial<Record<GigStatus, GigStatus[]>> = {
      submitted: ["open"],       // open → submitted
      approved: ["submitted"],   // submitted → approved
      rejected: ["submitted"],   // submitted → rejected
      paid: ["approved"],        // approved → paid
    };
    if (!allowed[next]?.includes(gig.status)) return undefined;
    Object.assign(gig, extra ?? {}, { status: next, updatedAt: new Date().toISOString() });
    return gig;
  }

  /** Unsafe-but-scoped update used below legal transitions (ids only). */
  update(id: string, extra: Partial<Gig>): Gig | undefined {
    const gig = this.records.get(id);
    if (!gig) return undefined;
    Object.assign(gig, extra, { updatedAt: new Date().toISOString() });
    return gig;
  }
}

export const gigStore = new GigStore();
