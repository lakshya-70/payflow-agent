# 05 · Demo Guide (flows, commands, video script)

Everything below was executed live during validation — the outputs shown are real.

## Flow 1 · Autonomous shopping (agent ⇄ seller negotiation)

**UI path:** dashboard → *Agent console* → type the message → watch the trace timeline.

```bash
curl -X POST http://localhost:4000/api/agent/chat -H "Content-Type: application/json" \
  -d '{ "message": "Buy the Titan USB-C hub at the best possible price" }'
```

**What happens:** `get_product_catalog` (finds the hub, list $59.99) →
`negotiate_with_seller` (agent haggles; seller holds its $41 secret floor → deal at **$45**) →
`create_paypal_order` → real sandbox order (**`42D08450M5493690L`**) + approval URL.
The dashboard shows every step with args/result/duration; the transaction grid gains an `ordered` row.

**Finish it:** open the approval URL, pay with a sandbox personal account (or hit *Pay now* on the
grid row → PayPal buttons → capture) → row flips to **`paid`**.

## Flow 2 · Human-in-the-loop guardrail

```bash
curl -X POST http://localhost:4000/api/agent/chat -H "Content-Type: application/json" \
  -d '{ "message": "Buy the most expensive laptop in the catalog" }'
```

Response tells the agent (and you) `ADMIN_APPROVAL_REQUIRED` with a transaction id: the order is
held in `pending_approval`. Approve in the **Approval inbox** (or
`POST /api/transactions/:id/approve`), ask the agent again → order completes. Spend control the
judges can *see*.

## Flow 3 · Freelancer payout pipeline

**UI path:** dashboard → *Freelancer payouts* → on a card: *Mark work submitted* → write the summary
→ *Run LLM review* 🔍 → *Release payout* 💸.

```bash
curl -X POST http://localhost:4000/api/gigs/<gigId>/submit -H "Content-Type: application/json" \
  -d '{ "summary": "Delivered the responsive hero section: headline, sub-copy, CTA, mobile-first CSS, Lighthouse 98." }'
curl -X POST http://localhost:4000/api/gigs/<gigId>/review     # → approve, confidence 0.93
curl -X POST http://localhost:4000/api/gigs/<gigId>/payout     # → batch payflow-mock-… (simulated)
```

**Live result:** approved @ 0.93 → batch `payflow-mock-mw4gbity` → gig `paid` · transaction row
`payout_completed` tagged *"simulated — PAYOUTS_MODE=mock"*.

Story to tell: *"the agent reviews quality, the admin releases money — automation with accountability."*

## Flow 4 · Webhooks → AI-written receipts

```bash
curl -X POST http://localhost:4000/api/webhooks/paypal -H "Content-Type: application/json" \
  -d '{ "id":"WH-1","event_type":"CHECKOUT.ORDER.APPROVED","resource":{ "id":"42D08450M5493690L" } }'
# 🧾 receipt appears on the transaction row in the grid

curl -X POST http://localhost:4000/api/webhooks/paypal -H "Content-Type: application/json" \
  -d '{ "id":"WH-2","event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{ "id":"8CD9876E1234F",
        "purchase_units":[{ "custom_id":"<transactionId>" }] } }'
# → status flips to "paid"; receive: "Thank you for purchasing the Titan 11-in-1 USB-C
#    Hub for $45.00. Your PayPal order 42D08450M5493690L is now paid."

# unknown id → honest ignore
# → 202 { "received": true, "action": "ignored (no matching transaction)" }
```

No public URL/tunnel needed — the handler code is exactly what a real PayPal webhook subscription
would hit.

## Postman

Import `postman/payflow-agent.postman_collection.json` → set `baseUrl` → run the folders in order.
Fill `gigId` / `paypalOrderId` / `transactionId` collection variables from earlier responses as you go.

## 90-second video script

| Time | Shot | Say |
|---|---|---|
| 0-10s | dashboard full view | "This is PayFlow — an agent platform for autonomous money movement on PayPal." |
| 10-35s | agent console trace | "I asked it to buy a USB-C hub… it browses, negotiates with a seller agent, and creates a real sandbox order at $45 — every reasoning step is visible." |
| 35-50s | gig payout pipeline | "For freelancers: submit work, the LLM reviews quality — approved at 0.93 — and the payout releases." |
| 50-70s | webhook + grid | "When PayPal confirms capture, a webhook fires and the LLM writes the payment receipt — check the grid." |
| 70-90s | approvals inbox | "And big spends need a human: orders over $500 sit here until I approve. Agents act — PayFlow governs." |

Keep the terminal (logs) visible on the right — judges love seeing `[agent] step N · tool=…` lines.
