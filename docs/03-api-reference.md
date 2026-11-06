# 03 · API Reference

Base URL: `http://localhost:4000` · All bodies are JSON · CORS allows the dashboard origin.

## Endpoints

| # | Method | Path | Purpose |
|---|---|---|---|
| 1 | GET | `/api/health` | status snapshot: PayPal env, MCP state + tool count, LLM config, credential flags |
| 2 | GET | `/api/catalog?query=&max_price=` | storefront products (secret floor prices never leak) |
| 3 | GET | `/api/agent/tools` | every tool the agent can use (4 PayFlow + filtered MCP) with JSON schemas |
| 4 | POST | `/api/agent/chat` | run an agent turn → `{ reply, trace[], transactions[] }` |
| 5 | GET | `/api/transactions?kind=&limit=` | money audit trail (`kind=order|payout`) |
| 6 | POST | `/api/transactions/:id/approve` | admin approval of a `pending_approval` order |
| 7 | POST | `/api/transactions/:id/reject` | reject a pending order |
| 8 | GET | `/api/paypal/config` | PayPal JS SDK config (sandbox client id + intent) for the buttons |
| 9 | POST | `/api/paypal/orders/:id/capture` | capture an approved sandbox order → transaction `paid` |
| 10 | GET | `/api/gigs` | freelancer gigs + pipeline status |
| 11 | POST | `/api/gigs/:id/submit` | attach work summary → `submitted` |
| 12 | POST | `/api/gigs/:id/review` | **LLM quality gate** → `approved`/`rejected` + reason + confidence |
| 13 | POST | `/api/gigs/:id/payout` | release payout (real batch or labeled simulation) |
| 14 | POST | `/api/webhooks/paypal` | webhook sink → receipt attached → (`paid`) |

---

## Examples (copy-paste-able)

### 1 · Health
```bash
curl http://localhost:4000/api/health
```
```json
{ "paypal": { "env": "sandbox", "credentials": true },
  "mcp": { "state": "ready", "toolCount": 4 },
  "llm": { "configured": true, "model": "openai/gpt-oss-120b" } }
```

### 2 · Catalog
```bash
curl "http://localhost:4000/api/catalog?query=hub&max_price=80"
```

### 4 · Agent chat
```bash
curl -X POST http://localhost:4000/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{ "message": "Buy the Titan USB-C hub at the best possible price", "history": [] }'
```
Response shape:
```json
{ "reply": "The Titan 11-in-1 USB-C Hub is secured for $45 …",
  "trace": [
    { "step": 1, "tool": "get_product_catalog",  "resultPreview": "…" },
    { "step": 2, "tool": "negotiate_with_seller", "resultPreview": "…" },
    { "step": 3, "tool": "create_paypal_order",   "resultPreview": "…" }
  ],
  "transactions": [ { "id": "…", "paypalId": "42D08450M5493690L", "status": "ordered" } ] }
```
> Each tool round is one step in `trace` — this is what the dashboard's timeline renders.

### 5-7 · Transactions + admin
```bash
curl "http://localhost:4000/api/transactions?kind=order&limit=50"
curl -X POST http://localhost:4000/api/transactions/<transactionId>/approve \
  -H "Content-Type: application/json" -d '{ "note": "approved by finance" }'
```

### 8-9 · PayPal JS config + capture
```bash
curl http://localhost:4000/api/paypal/config
curl -X POST http://localhost:4000/api/paypal/orders/<paypalOrderId>/capture
```

### 10-13 · Gig pipeline
```bash
curl http://localhost:4000/api/gigs                                  # list
curl -X POST http://localhost:4000/api/gigs/<gigId>/submit \
  -H "Content-Type: application/json" \
  -d '{ "summary": "Delivered responsive hero: headline, sub-copy, CTA, Lighthouse 98." }'
curl -X POST http://localhost:4000/api/gigs/<gigId>/review
# → { "review": { "decision": "approve", "confidence": 0.93, "reason": "…" }, "gig": { "status": "approved" } }
curl -X POST http://localhost:4000/api/gigs/<gigId>/payout
# → { "payout": { "batchId": "payflow-mock-…", "simulated": true }, "gig": { "status": "paid" } }
```

### 14 · Webhooks
```bash
# buyer approved the order  (match by PayPal order id)
curl -X POST http://localhost:4000/api/webhooks/paypal \
  -H "Content-Type: application/json" \
  -d '{ "id": "WH-demo-1", "event_type": "CHECKOUT.ORDER.APPROVED",
        "resource_type": "checkout_order", "resource": { "id": "<paypalOrderId>" } }'

# capture completed  (custom_id carries OUR transaction id — fallback matching path)
curl -X POST http://localhost:4000/api/webhooks/paypal \
  -H "Content-Type: application/json" \
  -d '{ "id": "WH-demo-2", "event_type": "PAYMENT.CAPTURE.COMPLETED",
        "resource": { "id": "8CD9876E1234F", "purchase_units": [ { "custom_id": "<transactionId>" } ] } }'

# unknown id → honest ignore
# → 202 { "received": true, "action": "ignored (no matching transaction)" }
```

## Error conventions

- `400` malformed body (zod field errors included) · `404/409` unknown entity / illegal state
  transition (e.g. reviewing an `open` gig) · `502` PayPal-side failure (gig stays `approved` for
  retry) · agent tool errors are returned as readable `TOOL_ERROR: …` text so the model can recover.
