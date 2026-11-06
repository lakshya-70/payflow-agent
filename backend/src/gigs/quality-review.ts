/**
 * LLM quality review for freelancer deliverables (Step 4).
 *
 * Before a gig payout fires, the work summary is reviewed by the configured
 * LLM against the gig spec, returning a strict JSON verdict:
 *   { "decision": "approve" | "reject", "confidence": 0..1, "reason": string }
 *
 * No-LLM fallback: deterministic approve (sandbox demo) tagged as heuristic.
 */
import OpenAI from "openai";

import type { Gig } from "./gig-store.js";
import { env, llmConfigured } from "../config/env.js";
import { logger } from "../logger.js";

export interface QualityReview {
  decision: "approve" | "reject";
  confidence: number;
  reason: string;
  /** true when produced by the deterministic fallback (no LLM key). */
  heuristic?: boolean;
}

/** Review the provided work summary against the gig description. */
export async function reviewGigQuality(gig: Gig, summary: string): Promise<QualityReview> {
  if (!llmConfigured) {
    return {
      decision: "approve",
      confidence: 0.6,
      reason: "Heuristic approval — no LLM key configured; manager summary recorded.",
      heuristic: true,
    };
  }

  try {
    const openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
    });

    const completion = await openai.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are PayFlow's payout quality gate. Compare the freelancer's work summary against the task description and decide whether the payout should be released (sandbox demo platform, no real money).
Be pragmatic: release when the summary plausibly meets the description; reject when it contradicts it, misses core requirements, or is clearly off-topic/incomplete.
Reply with ONLY one minified JSON object: {"decision":"approve"|"reject","confidence":<0..1>,"reason":"<one short sentence>"}`,
        },
        {
          role: "user",
          content: `Task: ${gig.title}\nDescription/spec: ${gig.description}\nDeal: $${gig.amount.toFixed(2)} → ${gig.freelancer}\nFreelancer's submitted work summary: """${summary || "(empty — no summary provided)"}"""`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(content.replace(/```json|```/g, "").trim()) as {
      decision?: string;
      confidence?: number;
      reason?: string;
    };
    const decision = parsed.decision === "reject" ? "reject" : "approve";
    return {
      decision,
      confidence: Number(parsed.confidence) || (decision === "approve" ? 0.7 : 0.5),
      reason: String(parsed.reason ?? (decision === "approve" ? "Looks complete." : "Does not meet the spec.")),
    };
  } catch (error) {
    logger.warn("quality-review", `LLM review failed (${error instanceof Error ? error.message : error}) — falling back to heuristic approve`);
    return {
      decision: "approve",
      confidence: 0.6,
      reason: `Heuristic approval (LLM unavailable: ${error instanceof Error ? error.message.slice(0, 80) : "error"}).`,
      heuristic: true,
    };
  }
}
