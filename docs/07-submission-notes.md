# 07 · Submission Notes (copy-paste into the hackathon form)

## Project name

**PayFlow Agent** — *autonomous PayPal checkout, governed*

## Elevator pitch (≤ 200 chars — ready to paste)

> Let AI spend money — safely. PayFlow combines autonomous PayPal checkout, agent-to-agent negotiation, freelancer payouts, AI-written receipts and human-in-the-loop control.

*(146 chars — fits with 54 to spare)*

Shorter alternate:
> An AI agent that shops and negotiates like a buyer, then pays on PayPal — supervised by a governance dashboard with approval gates, payouts and receipts.
*(~152 chars)*

## Long-form answers

### Inspiration
Autonomous agents are getting great at *acting* — browsing, negotiating, transacting. The missing half is **governance**: nobody can watch why an agent spent money, stop it before it does, or audit it afterwards. With payments that risk multiplies. We built PayFlow to give agents real PayPal superpowers *and* the control layer adults require.

### What it does
A buyer agent shops a curated catalog via the **official PayPal MCP server**, haggles with an independent **seller agent**, and executes **real sandbox PayPal orders**. Every order above $500 requires **human approval** before creation. The dashboard streams each tool call (args, results, duration), runs an **AG Grid audit feed**, and renders **PayPal buttons** in-context. A **freelancer payout pipeline** has the LLM review submitted work quality (approve/reject with confidence) before the admin releases a Payout batch. An **webhook listener** turns PayPal approval/capture events into **LLM-written receipts** attached to transactions. Unmatched event ids are ignored — the system never trusts unverified claims.

### How we built it
TypeScript monorepo: Express backend + Next.js dashboard. Backend spawns `@paypal/mcp` over stdio (official package), auto-mints/refreshes sandbox OAuth tokens, and merges 4 in-process domain tools (`get_product_catalog`, `negotiate_with_seller`, `create_paypal_order`, `execute_paypal_payout`) with filtered MCP tools into one tool-calling loop (max 10 rounds, every step traced). Orders use `@paypal/paypal-server-sdk`; Payouts use the documented `/v1/payments/payouts` REST endpoint. The LLM goes through an OpenAI-compatible gateway (Groq free tier in this build; one env var swaps providers). Zod-validated env, shared `runPayout()` guardrail service, pino-style logs, Postman collection, Render blueprint.

### Challenges we ran into
Groq's 8k token/min cap forced MCP tool filtering; the reasoning model returned hidden `reasoning` fields that broke message replay and starved small token caps (fixed: strip on replay, `max_completion_tokens: 500`). PayPal Payouts isn't available to India-based senders — so the platform gained an explicit `PAYOUTS_MODE=mock` with clearly-labeled batches instead of pretending money moved. tsx watch hung under OneDrive sync, etc.

### Accomplishments we're proud of
End-to-end flow validated live: chat → negotiation ($59.99 → $45) → sandbox order → webhook → AI receipt ("…is now paid"). Gig pipeline validated with 0.93-confidence LLM approval. A judge-safe honesty table separating real vs simulated pieces.

### What we learned
- MCP is the fastest path to *real* PayPal superpowers for agents.
- Guardrails are design features, not add-ons: matching-first webhooks, bounded tools, approval gates.
- Reasoning models need different plumbing than chat models.

### What's next
Postgres persistence (stores are shape-compatible), payout batch retries + refund console, signature-verified webhooks via a public Render URL, and real (sandbox) Payouts demoed from a supported sender country.

---

## Judge Q&A (study before presenting)

**Q: Is the money real?**
A: Everything touches PayPal's **sandbox** — real API calls, fake funds. Payouts in this build are additionally simulated (`PAYOUTS_MODE=mock`) because India-based sender accounts can't use Payouts; every record is labeled. One env var flips to real (sandbox) Payouts from a supported country.

**Q: Did you fake the agent's reasoning?**
A: No — the trace timeline is recorded from actual tool calls during actual LLM turns. You can replay any prompt yourself.

**Q: What stops a prompt injection from emptying accounts?**
A: Layered caps: per-payout amount bounds ($0.01–$10k), validated receivers, approval gate on large orders, sandbox-only credentials, and payouts behind an LLM-review + human-release pipeline.

**Q: Why Groq / why is the model swappable?**
A: `OPENAI_BASE_URL` makes the platform provider-agnostic (OpenAI, Groq, Azure, Ollama). We demo on Groq's free tier for cost-free judging.

**Q: How is this different from just "ChatGPT with tools"?**
A: Governance — visible traces, human approval gates, quality-assured money movement, audit trail with receipts, honest status semantics (`simulated`, `pending_approval`), plus the official MCP surface.

**Q: What's real vs simulated? (the honesty table)**
A: Real: OAuth flow, MCP child process, sandbox orders/captures, LLM calls, refund tools. Labeled simulation: payouts in mock mode, locally-POSTed webhook envelopes, negotiation arena (with enforced, tested invariants).

## Submission checklist

- [x] Backend typecheck passes (`npm run typecheck`)
- [x] Frontend builds (`npm run build`)
- [x] End-to-end demos validated (order, webhook receipt, gig payout)
- [x] Postman collection ships in-repo
- [x] Render blueprint ships in-repo
- [ ] Upload demo video (script: docs/05)
- [ ] Deploy to Render (optional — or demo locally + video)
- [ ] Public repo clean of secrets (`backend/.env` only)
- [ ] Choose tracks: AI Agents · Automation · Money Movement
