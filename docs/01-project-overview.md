# 01 · Project Overview

## One paragraph

**PayFlow Agent** is a multi-agent platform for autonomous money movement on PayPal, built for the
*PayPal AI Hackathon ("Build what's next with PayPal and AI")*. An LLM-powered checkout agent shops a
simulated catalog through the **official PayPal MCP server**, haggles with a seller agent, and
executes real **sandbox orders** — while an admin dashboard watches every tool call, gates big
purchases behind **human approval**, runs a **freelancer payout pipeline** (LLM quality review →
Payout), and converts PayPal **webhooks into AI-written receipts**.

## The problem we picked

Autonomous agents are getting scarily good at *acting* — browsing, negotiating, transacting. The
missing half is **governance**: nobody can watch *why* an agent spent money, stop it before it does,
or audit what happened after. Payments multiply that risk.

**PayFlow's answer:** one platform where the agent does the work but the platform provides the
guardrails — visible reasoning, human-in-the-loop spending gates, verified quality before payouts,
and an auditable money trail with receipts.

## What it does (the 4 steps)

| Step | Capability | Flagship demo |
|---|---|---|
| 1 · MCP integration | Backend spawns the **official `@paypal/mcp`** server over stdio; OAuth token auto-minted + refreshed; MCP tools merged into the LLM toolset | `npm run smoke:mcp` → "4 PayPal tools live" |
| 2 · Checkout agent | `get_product_catalog` → `negotiate_with_seller` (buyer LLM ⇄ seller LLM) → `create_paypal_order` (sandbox) + `execute_paypal_payout` | "Buy the Titan USB-C hub at the best price" → order at $45 with full trace |
| 3 · Admin dashboard | Chat console + expandable **trace timeline**, AG Grid transaction feed, approval inbox, in-context PayPal buttons | Watch the agent think; approve/deny $500+ orders |
| 4 · Payouts + webhooks | Gig pipeline: submit work → **LLM quality gate** → payout; webhooks → **LLM receipts**; Postman collection; Render blueprint | Gig approved at 0.93 confidence → payout batch; capture webhook → "is now paid" receipt |

## Hackathon track alignment

- **AI Agents** — buyer agent ⇄ seller agent negotiation loop, LLM quality reviewer, LLM receipt writer — all on tool-calling.
- **Automation** — catalog→deal→order→capture→receipt pipeline with zero manual steps (or a deliberate human pause on high-value orders); automated freelancer payouts.
- **Money Movement** — real sandbox Orders (create/approve/capture), Payouts (batch API or honest simulation), MCP-connected order/refund/transaction tools.

## What's real vs. simulated (judge-honesty table)

| Piece | Real or simulated? | Notes |
|---|---|---|
| OAuth token mint/refresh | **Real** (sandbox API) | ~30-min tokens, auto-refreshed |
| `@paypal/mcp` server | **Real** child process | 4 tools filtered by `PAYPAL_MCP_TOOLS` for token budgets |
| Orders (create/capture) | **Real** sandbox orders | e.g. `42D08450M5493690L` created during validation |
| Buyer ⇄ seller negotiation | Simulated *arena*, enforced invariants | floor prices are regression-tested |
| Checkout agent brain | Real LLM (Groq `openai/gpt-oss-120b`) | any OpenAI-compatible key works |
| Payouts | **Simulated when `PAYOUTS_MODE=mock`** | India can't be a Payouts *sender*; every row says "simulated" — set `api` + a supported country to go real (still sandbox) |
| Webhook events | Locally simulated envelopes (no public URL needed) | Same handler code a real webhook subscription would hit |
| Gig quality gate + receipts | Real LLM calls | deterministic fallback keeps the demo alive offline |

## Validation evidence (from live runs, Nov 2026)

- Agent chat negotiated the **Titan 11-in-1 USB-C Hub** from list $59.99 → **$45** and created sandbox order `42D08450M5493690L`.
- Freelancer gig approved with **0.93 confidence**, payout batch `payflow-mock-mw4gbity` (simulated, labeled).
- Capture webhook flipped the transaction to **`paid`** and attached the LLM receipt:
  *"Thank you for purchasing the Titan 11-in-1 USB-C Hub for $45.00. Your PayPal order 42D08450M5493690L is now paid."*
- Unmatched webhook id → honest `202 { "action": "ignored (no matching transaction)" }`.
