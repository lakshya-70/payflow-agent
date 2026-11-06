# 06 · Design Decisions & Trade-offs

The "why" behind every significant choice — useful for judges' deep questions.

## Decision log

| # | Decision | Why | Trade-off accepted |
|---|---|---|---|
| 1 | **Official `@paypal/mcp` as the integration backbone** | The hackathon's MCP track rewards it; MCP gives the agent *native* PayPal capabilities (orders, refunds, transaction search) without hand-rolling each API | MCP tool schemas consume context tokens — solved with a filter (see #2) |
| 2 | **MCP tool filter (`PAYPAL_MCP_TOOLS`)** | Groq's free tier = 8k tokens/min; all-MCP blew the budget in one turn | Agent sees 4 tools (get order, list transactions, refunds) instead of all — the money-critical paths stay in our 4 in-process tools anyway |
| 3 | **Merged toolset (in-process PayFlow tools + MCP tools)** | Domain logic (negotiation, approval gate, guardrails) must live in code where it's testable; MCP keeps an official PayPal surface for verification | Two execution paths to log/trace — solved with the unified trace array |
| 4 | **LLM goes through an OpenAI-compatible gateway** (`OPENAI_BASE_URL`) | Provider-agnostic: we ran Groq (`openai/gpt-oss-120b`) after the project's OpenAI key hit credit limits; the swap was one env change | Gateway quirks: reasoning-model habits (see #7), token caps |
| 5 | **`PAYOUTS_MODE=mock` for payouts in this build** | PayPal does not serve Payouts *senders* in India (this project's origin). Real REST code ships and activates with `PAYOUTS_MODE=api` from a supported country — still sandbox | Payouts here are simulated — but **always labeled** "simulated" in logs/UI, batch ids prefixed `payflow-mock-`. Zero false money claims |
| 6 | **Human-in-the-loop approval gate** (`PAYFLOW_APPROVAL_THRESHOLD`, default $500) | The whole pitch: governance over agent spend; ties Step 2 to Step 3 truefully | Adds a pause for big purchases — that's the feature, not a bug |
| 7 | **Reasoning-model hardening in the agent loop** | `gpt-oss` returns a hidden `reasoning` field; replaying it into follow-up messages breaks calls, and a tiny `max_tokens` starves it before it writes content | Fixed by stripping `reasoning` on replay + `max_completion_tokens: 500` for receipts + one nudge on empty replies |
| 8 | **Webhooks match events against OUR transaction store** | Never trust an incoming envelope's claims; an unmatched id is ignored with `202` — freer launch (no public URL) for a hackathon demo | Signature verification exists (`PAYPAL_WEBHOOK_ID`) but is opt-in for production |
| 9 | **In-memory stores** | Hackathon scope: zero infra, instant resets between demos; both stores share one record shape so a Postgres swap doesn't touch API/UI | Restarts wipe demo data — documented, acceptable for the pitch |
| 10 | **LLM quality gate with deterministic fallback** (`quality-review.ts`) | Payouts must never depend on the LLM being up; fallback tags itself "(heuristic)" so judges know which path fired | Fallback is lenient — but every payout still needs human click *and* stays in sandbox |
| 11 | **`tsx` without watch mode** | `tsx watch` hung on the OneDrive-synced directory | Manual restart on code changes (fine — we restart rarely while demoing) |
| 12 | **AG Grid + Tailwind neon UX** | A "governance console" should look like a mission-control, not a chat toy; AG Grid gives enterprise-style audit energy for the transaction feed | Slightly heavier page (still under 270 kB first load) |

## If we had 2 more weeks

- Postgres-backed stores (shape is already swap-ready)
- Real Payouts flow demoed from a supported sender country (`PAYOUTS_MODE=api`)
- Webhook signature verification on by default with a public Render URL
- Payout batch retries + refund app (the MCP refund tools are already live)
- A repeatable benchmark scoring the seller negotiator's concession behavior across randomized offers

## What we'd argue in front of judges

1. **Agents act; PayFlow governs.** Trace timeline + approval gate + audit grid = the missing "half" of agentic commerce.
2. **Real integration, honest simulation.** Every simulated element is labeled; every real PayPal path (OAuth, MCP, orders, capture) is genuinely exercised in sandbox.
3. **Provider-portable brain.** One env swap moves the whole platform between LLM providers.
