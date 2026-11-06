# ⚡ PayFlow Agent

**Multi-agent platform for autonomous money movement on PayPal** — built for the *PayPal AI Hackathon ("Build what's next with PayPal and AI": AI Agents · Automation · Money Movement)*.

> 📚 **Full documentation lives in [`docs/`](docs/README.md)** — study guide with architecture deep-dive,
> API reference, setup guide, demo walkthrough, design decisions and submission notes.

An LLM-powered procurement agent connects to the **official PayPal MCP server**, shops a simulated catalog, negotiates with seller agents, and executes PayPal Orders / Payouts — with a dashboard for observability and human approval.

| Step | Feature | Status |
|---|---|---|
| 1 | Project setup + PayPal MCP server integration (LLM ⇄ MCP boilerplate) | ✅ done |
| 2 | Autonomous checkout agent (catalog + seller negotiation + orders/payouts) | ✅ done |
| 3 | Frontend dashboard (agent chat + trace timeline + AG Grid transactions + approvals + PayPal buttons) | ✅ done |
| 4 | Automated gig payouts + PayPal webhooks (receipts) · Postman · Render deploy blueprint | ✅ done |

---

## Architecture

```
┌─────────────────────┐        ┌──────────────────────────────┐
│  Next.js frontend   │  HTTP  │        Express backend       │
│  (dark agentic UI)  │ ─────► │                              │
└─────────────────────┘        │  ┌────────────────────────┐  │
        │  PayPal JS SDK v6    │  │ Agent loop (OpenAI)    │  │
        ▼  (checkout buttons) │  │  ⇅ tool-calling        │  │
┌─────────────────────┐        │  │  ⇅ openai-bridge      │  │
│  Express backend    │        │  │ PayPal MCP client ─────┼──┼──► @paypal/mcp (stdio)
│  (this backend)     │        │  └────────────────────────┘  │       ⤷ orders.* · payments.* ·
└─────────────────────┘        │   routes: agent · gigs     │         transactions.* …
                               │   transactions · webhooks …  │
                               └──────────────────────────────┘
```

Key integration chosen for Step 1: the backend **spawns the official `@paypal/mcp` server** as a child process over **stdio**, minting a PayPal **sandbox access token** via OAuth (refreshed automatically) and passing it as `PAYPAL_ACCESS_TOKEN` — exactly the contract the official server documents.

> ℹ️ Payouts are **not** exposed by the MCP server or by `@paypal/paypal-server-sdk` v2.5 (orders/payments/subscriptions/search/vault only) — so `execute_paypal_payout` calls the documented `/v1/payments/payouts` REST endpoint directly with the same sandbox token the MCP server uses.

## Repo layout

```
payflow-agent/
├── backend/                     # Express API + PayPal MCP integration (TypeScript)
│   ├── .env.example             # ← copy to .env and fill in your sandbox keys
│   └── src/
│       ├── config/env.ts        # zod-validated environment (+ approval threshold)
│       ├── logger.ts
│       ├── catalog/
│       │   ├── products.ts      # simulated storefront seed data (list + floor prices)
│       │   └── catalog.service.ts
│       ├── transactions/
│       │   └── transaction-store.ts   # audit trail: statuses + admin approve/reject
│       ├── paypal/
│       │   ├── token-manager.ts # OAuth token mint/refresh (sandbox)
│       │   ├── paypal-client.ts # official SDK Client + OrdersController
│       │   └── payouts.ts       # Payouts REST (the SDK v2.5 has no payouts API)
│       ├── mcp/
│       │   ├── paypal-mcp-client.ts  # spawns @paypal/mcp over stdio, lists/calls tools
│       │   └── openai-bridge.ts      # MCP tool schema ⇄ OpenAI tool-calling
│       ├── agent/
│       │   ├── system-prompt.ts      # procurement agent prompt (negotiation rules)
│       │   ├── seller-agent.ts       # seller-side negotiation persona (LLM + rule fallback)
│       │   ├── run-agent-turn.ts     # LLM ⇄ merged tool set loop
│       │   ├── receipt-writer.ts     # webhook → LLM payment receipts (Step 4)
│       │   └── tools/                # registry.ts + catalog/negotiate/order/payout tools
│       ├── gigs/                 # Step 4: gig-store.ts + quality-review.ts (LLM gate)
│       ├── routes/               # health · agent · catalog · transactions · gigs · webhooks
│       ├── scripts/              # smoke tests + demos (MCP, tools, negotiation, agent)
│       └── server.ts
├── frontend/                    # Next.js (App Router) + Tailwind — dark/neon shell
│   ├── app/                     # layout · page · globals.css (dashboard composition)
│   ├── components/              # agent-console · transactions-grid · gig-payout-console …
│   └── lib/api.ts               # typed backend client
├── postman/                     # Postman collection (full API + webhook simulations)
├── render.yaml                  # Render blueprint: backend + frontend web services
└── package.json                 # npm workspaces root
```

## Prerequisites

- **Node.js ≥ 20** (tested on 22)
- **PayPal sandbox credentials** — [developer dashboard](https://developer.paypal.com/dashboard/) → *Apps & Credentials* → switch to **SANDBOX** → create an app → copy the Client ID + Secret
- **OpenAI API key** (or any OpenAI-compatible gateway)

## Quickstart

```bash
# 1. Install everything (npm workspaces: backend + frontend)
npm install

# 2. Configure the backend
cp backend/.env.example backend/.env
#    → paste PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET / OPENAI_API_KEY

# 3. Validate the PayPal MCP wiring end-to-end
npm run smoke:mcp
#    expected: token OK → "@paypal/mcp server connected — N tools exposed: …"

# 4. Run backend (:4000) + frontend (:3000) together
npm run dev
```

Open **http://localhost:3000** → the dashboard polls `/api/health` and lights up:

- **Backend API** — Express up
- **PayPal MCP** — tool count from the live MCP connection
- **LLM** — model name / missing key
- **PayPal REST** — sandbox credentials status

## API surface

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | status snapshot: PayPal env, MCP state + tool count, LLM config |
| GET | `/api/catalog` | simulated storefront products (query/max_price filters) |
| GET | `/api/agent/tools` | every tool the agent can use (PayFlow + MCP), with JSON schemas |
| POST | `/api/agent/chat` | run an agent turn → `{ reply, trace[], transactions[] }` |
| GET | `/api/transactions` | audit trail (kind/order · payout filter, limit) |
| POST | `/api/transactions/:id/approve` | **admin approval** for high-value pending orders |
| POST | `/api/transactions/:id/reject` | reject a pending order |
| GET | `/api/paypal/config` | public PayPal JS SDK config (client id + intent) for the buttons |
| POST | `/api/paypal/orders/:id/capture` | capture an approved sandbox order → marks the transaction `paid` |
| GET | `/api/gigs` | freelancer gigs + pipeline status (in-memory seed: 4 open gigs) |
| POST | `/api/gigs/:id/submit` | manager attaches the work summary → gig becomes `submitted` |
| POST | `/api/gigs/:id/review` | **LLM quality gate** → `approved` / `rejected` + reason + confidence |
| POST | `/api/gigs/:id/payout` | released an approved gig → PayPal Payouts batch (or a clearly-labeled simulated batch under `PAYOUTS_MODE=mock`) |
| POST | `/api/webhooks/paypal` | PayPal webhook sink → LLM receipt attached → `paid` (`CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`) |

Try the full flow (once `OPENAI_API_KEY` + sandbox credentials are set):

```bash
curl -X POST http://localhost:4000/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{ "message": "Buy me the Nova75 mechanical keyboard at the best possible price, max $100" }'
# → agent browses the catalog, negotiates with the seller agent, creates the order
# → { "reply": "…", "trace": [ … tool calls … ] }
```

## How the MCP integration works (`backend/src/mcp/`)

1. **`paypal/token-manager.ts`** — `POST https://api-m.sandbox.paypal.com/v1/oauth2/token` (client-credentials grant), caches the token, refreshes before expiry. A pre-minted `PAYPAL_ACCESS_TOKEN` can also be provided (e.g. minted in Postman).
2. **`mcp/paypal-mcp-client.ts`** — spawns the official `@paypal/mcp` entrypoint (`--tools=all`, `PAYPAL_ACCESS_TOKEN`, `PAYPAL_ENVIRONMENT`) with the MCP `StdioClientTransport`, performs the handshake, caches `listTools()`, and exposes `callTool()`. Runs on Windows too (direct `node` spawn, cmd.exe npx fallback).
3. **`mcp/openai-bridge.ts`** — converts MCP tool definitions (JSON Schema) into OpenAI `tools` for `chat.completions.create`, and formats model tool-calls back into MCP requests (errors go back to the model so it can self-correct).
4. **`agent/run-agent-turn.ts`** — the loop: user message → model → tool calls → results → model … → final answer, capped at 10 tool rounds; every step is traced for the dashboard.

## Agent architecture (Step 2)

The checkout agent runs on a **merged tool set**: four PayFlow domain tools (executed in-process, backed by the PayPal REST/SDK layer) plus every tool the official MCP server exposes.

| Tool | What it does |
|---|---|
| `get_product_catalog` | browses the simulated storefront (`catalog/`), filters by keyword/price |
| `negotiate_with_seller` | multi-agent negotiation — buyer offer in → seller persona out (`seller-agent.ts`): LLM persona when `OPENAI_API_KEY` is set, deterministic concession schedule otherwise; invariants enforced (never below floor, counters in [floor, list], lowballs always countered) |
| `create_paypal_order` | catalog lookup → price sanity → **human approval gate** (`PAYFLOW_APPROVAL_THRESHOLD`) → real sandbox order via the official `paypal-server-sdk` `OrdersController` → returns the PayPal order id + `approval_url` |
| `execute_paypal_payout` | sends a sandbox Payout batch (`/v1/payments/payouts`) — used for the gig-payout flow (extended in Step 4) |

Negotiation design notes:
- Each agent turn gets a fresh negotiation session (`AgentToolContext`) — no state leaks between user requests.
- The seller never accepts below its secret `floorPrice`; a lowball always produces a counter, never a silent raise. Both behaviors are regression-tested by `npm run negotiation-check`.

Human-in-the-loop:
- Orders at/above `PAYFLOW_APPROVAL_THRESHOLD` (default **$500**) return `ADMIN_APPROVAL_REQUIRED` with a transaction id. The admin approves via `POST /api/transactions/:id/approve` (or the Step 3 dashboard), and the agent's next call with the same item+amount picks the approval up and completes the order.

Validation without real keys:

```bash
npm run tools:dry-run        # exercises every tool; catalog/negotiation work offline,
                             # money tools fail with readable credential errors
npm run negotiation-check    # deterministic buyer⇄seller loop (counter → accept at floor)
npm run demo:agent -- -- "Buy me the best mechanical keyboard under $100"   # needs OPENAI_API_KEY
```

## Notes for the sandbox demo

- Use the sandbox personal test account (from the dashboard, *Sandbox → Accounts → Personal*) as the buyer when checking out; funds flow within the sandbox.
- Everything honours `PAYPAL_ENV`; flipping it to `production` immediately routes the same code to the live API — keep hackathon artifacts on `sandbox`.
- The PayPal MCP server prints its banner and API errors on stderr; the backend pipes those into the log stream (`[mcp-server]`) for the future activity log.

## Dashboard (Step 3)

`http://localhost:3000` renders the full command center:

- **Agent console** — chat with the checkout agent; every tool call (`get_product_catalog` →
  `negotiate_with_seller` → `create_paypal_order`) is shown as an expandable trace step with args,
  duration and result preview.
- **Approval inbox** — `pending_approval` orders surface here for the human decision; after approving,
  ask the agent again and it completes the order.
- **AG Grid transaction feed** — every order/payout with status pills, elapsed reasoning notes and
  PayPal references; live-polled every 8 s.
- **In-context PayPal buttons** — rows with an unpaid order show *Pay now*: the PayPal JS SDK renders
  smart buttons against the **existing** order id, and approval triggers the backend capture
  (transaction → `paid`).

Groq note: tool schemas for the MCP tools are filtered (`PAYPAL_MCP_TOOLS`) to stay inside Groq's free
8k-tokens-per-minute limit; the four `get_order / list_transactions / refunds` tools remain available
to the agent for verification and post-purchase state checks.

## Freelancer payout pipeline (Step 4)

Gig lifecycle: `open → submitted → approved | rejected → paid`.

1. **Manager submits work** — `POST /api/gigs/:id/submit` attaches the deliverable summary.
2. **LLM quality gate** — `POST /api/gigs/:id/review` asks the configured model (same OpenAI-compatible gateway as the agent) to compare the summary with the gig spec and return strict JSON `{ decision, confidence, reason }`. A deterministic heuristic approves-with-tag when no LLM key is configured or the call fails.
3. **Payout release** — `POST /api/gigs/:id/payout` runs the same `runPayout()` service the agent's `execute_paypal_payout` tool uses — shared guardrails (validated receiver email, bounded amounts) and transaction-store bookkeeping (`payout_initiated → payout_completed | failed`).

The dashboard's payout console walks each gig card through this pipeline (composer → review verdict with confidence → payout batch id), polling live.

### Simulated payouts (`PAYOUTS_MODE`)

PayPal's Payouts platform isn't available to sender accounts in every country (India is the notable example — an India-based PayPal account cannot send payouts). To keep the demo functional everywhere, `backend/.env` accepts:

| `PAYOUTS_MODE` | behavior |
|---|---|
| `api` (default) | real `/v1/payments/payouts` REST calls against the sandbox |
| `mock` | clearly-labeled **simulated** batch (`payflow-mock-…`) — completes instantly as `payout_completed`; every affected row in the UI/log is tagged `simulated` |

No false money claims: transaction notes and gig cards explicitly say `simulated — PAYOUTS_MODE=mock`.

### Webhooks → LLM receipts

`POST /api/webhooks/paypal` handles:

- `CHECKOUT.ORDER.APPROVED` — matched against our transaction store by PayPal order id → an LLM-written receipt is attached to the transaction record (visible in the dashboard's transaction feed 🧾).
- `PAYMENT.CAPTURE.COMPLETED` — same matching (PayPal order id or our own `custom_id`) → transaction flips to `paid` with a fresh receipt.

Receipts (`agent/receipt-writer.ts`) are grounded **only** in real facts (item, amount, PayPal refs) with a deterministic fallback when the LLM is unavailable. Events for unmatched ids are absorbed with `202 { action: "ignored (no matching transaction)" }`.

For production-style strictness set `PAYPAL_WEBHOOK_ID` (developer dashboard → Webhooks) to enable signature verification mode; demo setups accept unverified envelopes but never trust ids blindly — matching happens against our own store.

Simulate locally (no public URL needed) or with the bundled Postman collection:

```bash
curl -X POST http://localhost:4000/api/webhooks/paypal \
  -H "Content-Type: application/json" \
  -d '{ "id": "WH-demo", "event_type": "CHECKOUT.ORDER.APPROVED", "resource": { "id": "<paypal_order_id>" } }'
```

## Postman

`postman/payflow-agent.postman_collection.json` covers the whole surface — health/catalog, agent chat (shopping + payout prompts), transaction admin, PayPal order capture, the Step 4 gig pipeline, and webhook simulations. Set `baseUrl` (default `http://localhost:4000`) and fill `gigId` / `paypalOrderId` / `transactionId` from prior responses as you go.

## Deploying to Render

`render.yaml` defines the blueprint (repo root):

- **payflow-backend** — `npm install && npm run build --workspace backend`, starts `node backend/dist/server.js`, health check `/api/health` (the PayPal MCP server is spawned as a child process, so Node is on PATH).
- **payflow-frontend** — `npm run build --workspace frontend`, \`npm run start --workspace frontend\`.

```bash
render blueprint launch   # from the repo root (or Dashboard → New → Blueprint)
```

Set the prompted secrets (`sync:false` in the blueprint): `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `OPENAI_API_KEY` (+ optional `OPENAI_MODEL`/`OPENAI_BASE_URL` — e.g. the Groq gateway used in this build), `PAYOUTS_MODE`, `PAYFLOW_APPROVAL_THRESHOLD`. Render injects `PORT` itself — never set it. After the first deploy, point the frontend's `NEXT_PUBLIC_API_URL` at the backend URL (`https://payflow-backend.onrender.com`).

## Roadmap (post-hackathon)

- Persist transactions/gigs to Postgres — both stores already share one record shape.
- Batch payouts with a retry queue for failed batches; refund flow surfaced in the dashboard (the MCP refund tools are already wired).
- Out-of-the-box webhook signature verification once `PAYPAL_WEBHOOK_ID` is set.
