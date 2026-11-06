/**
 * PayPal `@paypal/paypal-server-sdk` client factory.
 *
 * Our agent needs typed access to Orders (create/get) — this uses the official
 * SDK exactly as PayPal's own Agent Toolkit does internally:
 *
 *     new Client({ clientCredentialsAuthCredentials: {...}, environment })
 *     new OrdersController(client)          // controllers take the Client
 *
 * NOTE: PayPal SDK v2.5 has NO payouts controller — see paypal/payouts.ts for
 * the Payouts implementation (documented `/v1/payments/payouts` REST endpoint).
 */
import { Client, Environment, OrdersController } from "@paypal/paypal-server-sdk";

import { env, paypalCredsConfigured } from "../config/env.js";

interface PayPalSdk {
  client: Client;
  orders: OrdersController;
}

let instance: PayPalSdk | undefined;

/** Lazily build the SDK client + controllers; throws a readable error without credentials. */
export function getPayPalSdk(): PayPalSdk {
  if (!paypalCredsConfigured) {
    throw new Error(
      "PayPal credentials missing — add PAYPAL_CLIENT_ID & PAYPAL_CLIENT_SECRET to backend/.env",
    );
  }

  instance ??= (() => {
    if (!(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET)) {
      throw new Error("PayPal credentials missing"); // narrowed for TS
    }
    const client = new Client({
      clientCredentialsAuthCredentials: {
        oAuthClientId: env.PAYPAL_CLIENT_ID,
        oAuthClientSecret: env.PAYPAL_CLIENT_SECRET,
      },
      // Same configuration style as the official PayPal Agent Toolkit.
      environment: env.PAYPAL_ENV === "production" ? Environment.Production : Environment.Sandbox,
      timeout: 0,
    });
    return { client, orders: new OrdersController(client) };
  })();

  return instance;
}
