// THE WIRE — model client. Model `claude-sonnet-5-5` (CLAUDE.md §4.2), key from ANTHROPIC_API_KEY
// (gitignored .env). Hard 1.5 s budget per call: on timeout, error, refusal or empty text the caller
// uses a template line. Without a key, `available` is false and only templates are used.
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO } from "../../scripts/spike-lib.ts";

export const WIRE_MODEL = "claude-sonnet-5-5";
export const LLM_BUDGET_MS = 1500;

try { process.loadEnvFile(join(REPO, ".env")); } catch { /* no .env: templates only */ }

export const SYSTEM_PROMPT = readFileSync(join(REPO, "keeper", "wire", "prompt.md"), "utf8");

export type LlmResult = { text: string | null; ms: number; why?: string };

export class WireLlm {
  private client: Anthropic | null;
  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    // maxRetries 0: a retry can never fit in the 1.5 s budget.
    this.client = apiKey ? new Anthropic({ apiKey, maxRetries: 0 }) : null;
  }
  get available() { return this.client !== null; }

  /** One short completion within `budgetMs`; never throws. */
  async complete(userText: string, maxTokens: number, budgetMs = LLM_BUDGET_MS): Promise<LlmResult> {
    const t0 = performance.now();
    if (!this.client) return { text: null, ms: 0, why: "no ANTHROPIC_API_KEY" };
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), budgetMs);
    try {
      const res = await this.client.messages.create(
        {
          model: WIRE_MODEL,
          max_tokens: maxTokens,
          // Thinking off between tool calls (no tools here) and low effort: latency over depth.
          thinking: { type: "between_tools" },
          output_config: { effort: "low" },
          system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: userText }],
        },
        { signal: ac.signal, timeout: budgetMs },
      );
      const ms = performance.now() - t0;
      if (res.stop_reason === "refusal") return { text: null, ms, why: "refusal" };
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("").trim();
      return text ? { text, ms } : { text: null, ms, why: "empty" };
    } catch (e) {
      const ms = performance.now() - t0;
      if (e instanceof Anthropic.APIUserAbortError || e instanceof Anthropic.APIConnectionTimeoutError) return { text: null, ms, why: "timeout > 1.5 s" };
      if (e instanceof Anthropic.AuthenticationError) return { text: null, ms, why: "auth error" };
      if (e instanceof Anthropic.RateLimitError) return { text: null, ms, why: "rate limited" };
      if (e instanceof Anthropic.APIError) return { text: null, ms, why: `api error ${e.status}` };
      return { text: null, ms, why: `error ${String(e).slice(0, 60)}` };
    } finally {
      clearTimeout(timer);
    }
  }
}
