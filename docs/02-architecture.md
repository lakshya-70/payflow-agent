# 02 · Architecture Deep-Dive

## System map

```
┌───────────────────────────┐         ┌────────────────────────────────────┐
│  FRONTEND  :3000          │   HTTP  │  BACKEND  :4000                    │
│  Next.js dashboard        │ ──────► │  Express (TypeScript)              │
│                           │         │                                    │
│  HealthBar (polls 15s)    │         │  Agent loop (LLM, tool-calling)    │
│  AgentConsole (chat+trace)│         │    ⇅  max 10 tool rounds           │
│  TransactionsGrid (8s)    │         │    ⇅  merged toolset               │
│  ApprovalsInbox           │         │  ├─ 4 PayFlow tools (in-process)   │
│  GigPayoutConsole         │         │  └─ filtered @paypal/mcp tools     │
│  PayOrderModal            │         │                                    │
│                           │         │  gig store · txn store · receipts  │
│  PayPal JS SDK buttons ───┼─────────┼─► /api/paypal/orders/:id/capture   │
│  (direct to PayPal)       │         │                                    │
└───────────────────────────┘         └────────────────────────────────────┘
                                                    │ stdio (spawned child)
                                                    ▼
                                        @paypal/mcp → api-m.sandbox.paypal.com
```

**Rule:** the frontend *never* touches PayPal credentials or secrets — it only speaks to the Express
API. The backend owns `backend/.env` (zod-validated once at boot) and does all money movement.

---

## Layer 1 · Environment (`backend/src/config/env.ts`)

Every env var is parsed through a **zod schema** at startup: `PORT`, `PAYPAL_ENV`, credentials,
LLM config (`OPENAI_API_KEY` / `OPENAI_MODEL` / `OPENAI_BASE_URL` — any OpenAI-compatible gateway),
`PAYPAL_MCP_TOOLS`, `PAYFLOW_APPROVAL_THRESHOLD`, `PAYOUTS_MODE`, `PAYPAL_WEBHOOK_ID`,
`FRONTEND_ORIGIN`. Bad config fails at boot, not mid-demo. The file is loaded from
`backend/.env` relative to the source dir, so scripts work from any cwd.

## Layer 2 · PayPal MCP integration (`backend/src/mcp/`)

1. **`token-manager.ts`** — `POST /v1/oauth2/token` (client-credentials). Caches the sandbox token,
   refreshes before expiry (log: *"PayPal access token minted — valid for ~530 min"*). An optional
   pre-minted `PAYPAL_ACCESS_TOKEN` can be supplied instead.
2. **`paypal-mcp-client.ts`** — spawns the **official npm `@paypal/mcp`** package as a child process
   on **stdio**, passes the token via `PAYPAL_ACCESS_TOKEN`, performs the MCP handshake, caches
   `listTools()`, exposes `callTool()`. Works on Windows (direct `node` spawn + npx fallback).
3. **`openai-bridge.ts`** — translates MCP JSON-schemas ⇄ OpenAI tool definitions; tool errors are
   appended to the conversation so the model self-corrects.
4. **The filter** — Groq's free tier allows ~8k tokens/minute, so `PAYPAL_MCP_TOOLS=`
   `orders.get,transactions.list,payments.createRefund,payments.getRefunds` keeps schemas tiny while
   giving the agent verification powers (check an order, list transactions, issue refunds).

## Layer 3 · The agent (`backend/src/agent/`)

**`run-agent-turn.ts`** — the loop:

```
user message → LLM → tool_calls? ── yes → execute (in-process or via MCP) → append results ↘
                     │ no                                      (repeat, max 10 rounds)
                     ▼
                 final reply  →  { reply, trace[] }   (every step recorded for the dashboard)
```

Reasoning-model hardening (learned the hard way with Groq): assistant messages have their `reasoning`
field **stripped before replay**, and one "say something" nudge fires if content comes back empty.

### The four PayFlow tools (`agent/tools/registry.ts`)

| Tool | File | Inside |
|---|---|---|
| `get_product_catalog` | `catalog-tool.ts` | filters `catalog/products.ts` (8 seeded items, each with a secret `floorPrice`) |
| `negotiate_with_seller` | `negotiate-tool.ts` → `seller-agent.ts` | buyer offer → **seller persona** (LLM; deterministic concession schedule as fallback). Invariants: never below floor, counters stay in `[floor, list]`, lowballs always countered — regression-tested by `npm run negotiation-check` |
| `create_paypal_order` | `order-tool.ts` | price sanity-check → **approval gate** (≥ `PAYFLOW_APPROVAL_THRESHOLD` $500 → `pending_approval` until an admin approves; the agent's next attempt with same item+amount completes) → real sandbox order via `@paypal/paypal-server-sdk` OrdersController → stores PayPal id + approval URL |
| `execute_paypal_payout` | `payout-tool.ts` | delegates to the shared `tools/payout-service.ts` |

### Shared payout service (`agent/tools/payout-service.ts`)

Single chokepoint for money-out: validated receiver email, amount bounds ($0.01–$10,000),
transaction bookkeeping `payout_initiated → payout_completed | failed`, readable errors.
Used by both the agent tool and the gig-payout API — same guardrails everywhere.

## Layer 4 · Payouts (`backend/src/paypal/payouts.ts`)

`@paypal/paypal-server-sdk` v2.5 ships no Payouts controller, so PayFlow calls
`POST /v1/payments/payouts` directly with the MCP's sandbox token.

**`PAYOUTS_MODE`** switches transport:
- `api` — real (sandbox) Payouts REST batching.
- `mock` — **clearly-labeled simulation**: batch id `payflow-mock-…`, note
  *"simulated payout — PAYOUTS_MODE=mock"*, completes instantly. Reason: PayPal does not serve
  Payouts *senders* in every country (India, this project's origin). Every affected record/UI row
  says "simulated" — no false money claims anywhere.

## Layer 5 · Gig pipeline (`backend/src/gigs/` + `routes/gig.routes.ts`)

State machine in `gig-store.ts` (in-memory; 4 seeded freelancers):

```
open ──submit(summary)──► submitted ──review(LLM)──► approved ──payout(runPayout)──► paid
                                              └──► rejected (payout blocked)
```

**`quality-review.ts`** — the quality gate: the LLM compares the submitted summary against the gig
spec and must return strict JSON `{ "decision": "approve"|"reject", "confidence": 0..1, "reason": … }`.
Malformed output → safe defaults; LLM unavailable → deterministic "heuristic" approve, so demos never
brick. Validated live: approve @ **0.93 confidence**.

## Layer 6 · Webhooks + receipts (`routes/webhook.routes.ts`, `agent/receipt-writer.ts`)

`POST /api/webhooks/paypal`:
- **Matching first, never trusting:** events are matched against *our own* transaction store —
  by PayPal order id (`resource.id`) first, then by `purchase_units[].custom_id` (our transaction id)
  for capture-style events. Unknown ids → `202 { "action": "ignored (no matching transaction)" }`.
- **`CHECKOUT.ORDER.APPROVED`** attaches a receipt (transaction note: "CHECKOUT.ORDER.APPROVED received").
- **`PAYMENT.CAPTURE.COMPLETED`** flips status → **`paid`** *before* composing the receipt, so the
  receipt text cites the final state ("…is now paid").
- **`receipt-writer.ts`** grounds the LLM on only true facts (item, amount, PayPal refs, status),
  `max_completion_tokens: 500` (reasoning models spend tokens thinking before they write — a tiny
  cap yields empty content). No LLM key → deterministic fallback receipt.
- `PAYPAL_WEBHOOK_ID` enables signature-verification mode for production-style deployments.
- No public URL needed for demos — POST the envelopes locally or via the Postman collection.

## Layer 7 · Stores

`transactions/transaction-store.ts` and `gigs/gig-store.ts` are **in-memory Maps** (deliberate
hackathon scope) with one mutually-shaped record each — a Postgres swap wouldn't touch the API or UI.

Transaction statuses: `ordered · pending_approval · paid · payout_initiated · payout_completed ·
failed · rejected`. Gig statuses: `open · submitted · approved · rejected · paid`.

## Routes (server.ts)

8 routers mounted under `/api`: `health` · `agent` (chat/tools) · `catalog` · `transactions`
(list/approve/reject) · `paypal` (config/capture) · `gigs` (list/submit/review/payout) ·
`webhooks`. A generic request logger (`[http]` lines) and a structured pino-style logger keep every
event observable in the console.
