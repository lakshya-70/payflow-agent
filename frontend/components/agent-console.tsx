"use client";

/**
 * Agent chat console (Step 3).
 *
 * Talks to POST /api/agent/chat and renders:
 *   · the agent's reply line by line
 *   · a live trace timeline: every tool call the agent made (name, args,
 *     duration, trimmed result) — the "agent reasoning" view of the demo.
 */
import { useEffect, useRef, useState } from "react";

import { sendAgentChat, type AgentTraceStep } from "@/lib/api";

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  trace?: AgentTraceStep[];
  isError?: boolean;
}

const SUGGESTIONS = [
  "Buy me the best mechanical keyboard under $100",
  "Get the Nova75 keyboard at the best possible price, max $120",
  "Find a deal on a USB-C hub and buy it",
];

function TraceTimeline({ trace }: { trace: AgentTraceStep[] }) {
  if (trace.length === 0) return null;
  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-600">agent tool trace</p>
      {trace.map((step) => (
        <details
          key={`${step.step}-${step.tool}`}
          className="group rounded-lg border border-flow-line bg-black/20 px-3 py-2 open:border-flow-cyan/30"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs">
            <span className="grid h-5 w-5 place-items-center rounded-md bg-flow-cyan/15 font-mono text-[10px] text-flow-cyan">
              {step.step}
            </span>
            <span className="font-mono text-flow-cyan/90">{step.tool}</span>
            <span className="ml-auto text-[10px] text-slate-600">{step.durationMs}ms</span>
          </summary>
          <div className="mt-2 grid gap-2 text-[11px] leading-relaxed">
            <div>
              <span className="text-slate-600">args&nbsp;·&nbsp;</span>
              <code className="whitespace-pre-wrap break-words text-slate-400">
                {JSON.stringify(step.args)}
              </code>
            </div>
            <div>
              <span className="text-slate-600">result&nbsp;·&nbsp;</span>
              <code className="whitespace-pre-wrap break-words text-slate-400">
                {step.resultPreview}
              </code>
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}

export function AgentConsole({ onTransactionsChanged }: { onTransactionsChanged: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const userMessage: ChatMessage = { id: nextId.current++, role: "user", content: trimmed };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setBusy(true);

    try {
      // History for the API = prior turns only (role/content, no traces).
      const prior = messages
        .filter((m) => !m.isError)
        .map(({ role, content }) => ({ role, content }));

      const { reply, trace } = await sendAgentChat(trimmed, prior);
      setMessages((current) => [
        ...current,
        { id: nextId.current++, role: "assistant", content: reply, trace },
      ]);
      onTransactionsChanged();
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: nextId.current++,
          role: "assistant",
          content: `⚠️ ${error instanceof Error ? error.message : "Agent turn failed"}`,
          isError: true,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass-panel flex h-[560px] flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-flow-line px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-flow-violet/15 text-[11px] text-flow-violet shadow-neon-violet">
            ⌘
          </span>
          <p className="font-display text-sm text-slate-200">Agent console</p>
        </div>
        <span className="chip text-[10px]">
          checkout · negotiate · order
        </span>
      </div>

      {/* Thread */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="font-display text-slate-400">Give the agent a shopping task</p>
              <p className="mt-1 text-xs text-slate-600">
                it browses the catalog, negotiates with a seller agent and creates the PayPal order
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void send(suggestion)}
                    className="chip transition-colors hover:border-flow-cyan/50 hover:text-flow-cyan"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                message.role === "user"
                  ? "border border-flow-cyan/30 bg-flow-cyan/10 text-slate-100"
                  : message.isError
                    ? "border border-rose-500/30 bg-rose-500/10 text-rose-200"
                    : "border border-flow-line bg-white/[0.03] text-slate-300"
              }`}
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
              {message.trace && message.trace.length > 0 && <TraceTimeline trace={message.trace} />}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-flow-cyan" />
            agent is working — catalog → negotiation → order…
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        className="flex items-center gap-2 border-t border-flow-line px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="e.g. Buy a keyboard under $100 at the best price"
          className="h-10 flex-1 rounded-xl border border-flow-line bg-black/30 px-3.5 text-sm text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-flow-cyan/50"
        />
        <button
          type="submit"
          disabled={busy || input.trim().length === 0}
          className="h-10 rounded-xl border border-flow-cyan/40 bg-flow-cyan/15 px-4 text-sm font-medium text-flow-cyan transition-all hover:bg-flow-cyan/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
