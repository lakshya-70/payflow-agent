# 04 · Setup & Run Guide

## Prerequisites

- **Node.js ≥ 20** (tested on 22)
- **PayPal sandbox credentials** — [developer dashboard](https://developer.paypal.com/dashboard/) →
  *Apps & Credentials* → toggle **SANDBOX** → create app → copy Client ID + Secret
- **An OpenAI-compatible LLM key** — OpenAI directly, or a gateway like Groq (free tier works; this
  build ran on Groq `openai/gpt-oss-120b`)

## Install

```bash
git clone <your-repo-url> payflow-agent   # or work from the existing folder
cd payflow-agent
npm install                               # installs backend + frontend workspaces
```

## Configure (`backend/.env`)

```bash
cp backend/.env.example backend/.env      # then edit backend/.env
```

| Variable | Required | Example / default | What it does |
|---|---|---|---|
| `PORT` | no | `4000` | Express API port |
| `NODE_ENV` | no | `development` | runtime label |
| `PAYPAL_ENV` | no | `sandbox` | **keep sandbox** — flipping to production routes the same code live |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | **yes** | from dashboard | sandbox REST credentials |
| `PAYPAL_ACCESS_TOKEN` | no | — | reuse a pre-minted sandbox token instead of auto-OAuth |
| `OPENAI_API_KEY` | **yes** | `sk-…` / `gsk_…` | agent brain (any OpenAI-compatible gateway) |
| `OPENAI_MODEL` | no | `gpt-4o-mini` / `openai/gpt-oss-120b` | model id |
| `OPENAI_BASE_URL` | no | `https://api.groq.com/openai/v1` | OpenAI-compatible gateway |
| `PAYPAL_MCP_TOOLS` | no | `all` | tool filter for the MCP server — set the 4-tool list on tight token budgets |
| `PAYFLOW_APPROVAL_THRESHOLD` | no | `500` | USD at/above which orders need admin approval |
| `PAYOUTS_MODE` | no | `api` | `api` = real sandbox Payouts · `mock` = clearly-labeled simulation (India senders) |
| `PAYPAL_WEBHOOK_ID` | no | — | enables webhook signature-verification mode |
| `FRONTEND_ORIGIN` | no | `http://localhost:3000` | CORS allowlist |

Groq recipe used in this build:
```
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_MODEL=openai/gpt-oss-120b
PAYPAL_MCP_TOOLS=orders.get,transactions.list,payments.createRefund,payments.getRefunds
```

## Run

```bash
npm run dev          # backend :4000 + frontend :3000 together (concurrently)
```

Open **http://localhost:3000** — the HealthBar should light: API up · MCP ready · LLM model shown.

## Command reference

| Command | What it does |
|---|---|
| `npm run dev` | both services together |
| `npm run dev:backend` / `npm run dev:frontend` | single service |
| `npm run smoke:mcp` | validates the MCP wiring end-to-end (token → handshake → tool list) |
| `npm run tools:dry-run` | exercises every tool; money tools fail with *readable* credential errors — works without any keys |
| `npm run negotiation-check` | deterministic buyer⇄seller negotiation regression (counter → accept at floor) |
| `npm run demo:agent -- -- "Buy me the best mechanical keyboard under $100"` | headless agent run (needs LLM key) |
| `npm run typecheck` | TS check across workspaces |

## Troubleshooting (the issues we actually hit)

| Symptom | Cause | Fix |
|---|---|---|
| "backend offline" in the dashboard | two `npm run dev` sessions fighting over ports | run **one** session; kill stray node processes before relaunch |
| slow first boot | OneDrive-synced folder I/O | wait 10-20s; check the terminal for `[api] backend listening` before calling APIs |
| first agent turn errors `MCP error -32001 Request timed out` | MCP server still handshaking at boot | retry the turn a few seconds later |
| `429` from the LLM | gateway token-per-minute cap (Groq free tier = 8k) | pace bursts ~15-20 s; keep `PAYPAL_MCP_TOOLS` filtered |
| gigs/transactions vanish after restart | in-memory stores by design | expected; re-run the demo pipeline |
| `next build` then dev acts stale | both share `.next` | restart `npm run dev` after any production build |
| receipt text empty (fixed in code) | reasoning models spend tokens *thinking* first | `max_completion_tokens: 500`, content checked with fallback |
