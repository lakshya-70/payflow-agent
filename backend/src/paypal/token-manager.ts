/**
 * PayPal OAuth access-token manager.
 *
 * The official PayPal MCP server (`@paypal/mcp`) authenticates with a PayPal
 * access token (PAYPAL_ACCESS_TOKEN), not the raw client id/secret pair.
 * Tokens minted via the OAuth endpoint live for several hours (sandbox ≈ 9h),
 * so we cache them and refresh slightly before expiry. Everything targets the
 * SANDBOX environment by default.
 */
import { env } from "../config/env.js";
import { logger } from "../logger.js";

const OAUTH_BASE_URL: Record<"sandbox" | "production", string> = {
  sandbox: "https://api-m.sandbox.paypal.com",
  production: "https://api-m.paypal.com",
};

/** REST base URL for the configured environment (Orders/Payouts/Trx REST APIs). */
export function paypalApiBaseUrl(): string {
  return OAUTH_BASE_URL[env.PAYPAL_ENV];
}

/** Refresh tokens this long before their absolute expiry. */
const EXPIRY_SAFETY_MARGIN_MS = 5 * 60 * 1000;

class TokenManager {
  private cached?: { token: string; expiresAtMs: number };
  private inFlight?: Promise<string>;

  /** True when a token can be produced (pre-minted token or credentials). */
  get configured(): boolean {
    return Boolean(
      env.PAYPAL_ACCESS_TOKEN || (env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET),
    );
  }

  /** Cached token while it is valid, otherwise a fresh one (single-flight). */
  async getToken(): Promise<string> {
    if (this.cached && Date.now() < this.cached.expiresAtMs) return this.cached.token;
    this.inFlight ??= this.fetchToken().finally(() => (this.inFlight = undefined));
    return this.inFlight;
  }

  private async fetchToken(): Promise<string> {
    // Pre-minted token (e.g. from Postman / Claude Desktop config) — use as-is.
    if (env.PAYPAL_ACCESS_TOKEN) return env.PAYPAL_ACCESS_TOKEN;

    if (!(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET)) {
      throw new Error(
        "PayPal credentials missing — set PAYPAL_CLIENT_ID & PAYPAL_CLIENT_SECRET (or PAYPAL_ACCESS_TOKEN) in backend/.env",
      );
    }

    const baseUrl = OAUTH_BASE_URL[env.PAYPAL_ENV];
    const basic = Buffer.from(
      `${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`,
    ).toString("base64");

    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`PayPal OAuth token request failed (${response.status}): ${detail}`);
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    const ttlMs = Math.max((data.expires_in ?? 0) * 1000 - EXPIRY_SAFETY_MARGIN_MS, 60_000);
    this.cached = { token: data.access_token, expiresAtMs: Date.now() + ttlMs };
    logger.debug(
      "oauth",
      `PayPal access token minted — valid for ~${Math.round(ttlMs / 60_000)} min`,
    );
    return this.cached.token;
  }
}

export const tokenManager = new TokenManager();
