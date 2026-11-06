# 📚 PayFlow Agent — Documentation Folder

Everything you need to **study the project, run it, demo it, and submit it** to the PayPal AI Hackathon.

> Collectively this folder is the "README pack" — the top-level `README.md` is the quick-reference;
> these files go deeper.

## Reading order (study path)

| # | File | What you'll learn | Read when |
|---|---|---|---|
| 1 | [`01-project-overview.md`](01-project-overview.md) | The story: problem → solution → features → what's real vs simulated | First |
| 2 | [`02-architecture.md`](02-architecture.md) | Every layer explained: MCP, agent loop, tools, gig pipeline, webhooks, stores | Before a deep-dive |
| 3 | [`03-api-reference.md`](03-api-reference.md) | All 11 endpoints with request/response examples | While testing |
| 4 | [`04-setup-and-run.md`](04-setup-and-run.md) | Install, env vars, commands, troubleshooting | To run locally |
| 5 | [`05-demo-guide.md`](05-demo-guide.md) | 4 demo flows with exact commands + expected output + video script | Before recording |
| 6 | [`06-design-decisions.md`](06-design-decisions.md) | Why Groq, why mock payouts, why filtered MCP tools, trade-offs | Judges' questions |
| 7 | [`07-submission-notes.md`](07-submission-notes.md) | Elevator pitch, criteria mapping, judge Q&A, submission checklist | Last, submission day |

## Fast facts

- **Stack**: Next.js 15 (dashboard) · Express + TypeScript (API) · official `@paypal/mcp` (stdio) · `@paypal/paypal-server-sdk` (orders) · Payouts REST · AG Grid · OpenAI-compatible LLM (Groq gateway in this build)
- **Ports**: backend `:4000` · frontend `:3000`
- **Money rules**: everything hits the **PayPal sandbox** only; payouts are clearly labeled **simulated** when `PAYOUTS_MODE=mock` (India sender restriction)
- **Status**: all 4 hackathon steps complete and runtime-validated (orders, negotiation, approvals, gig payouts, webhook receipts)
