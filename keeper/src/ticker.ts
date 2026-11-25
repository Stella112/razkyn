// Tick driver (CLAUDE.md §6.3): calls the permissionless `tick` and `tick_raiders` (hazards +
// fog) at ~10 Hz with pipelined sends, and records landing / latency / stall metrics (§9 test 12).
import { Transaction } from "@solana/web3.js";
import type { RaidSession } from "../../scripts/raid-lib.ts";
import { sleep } from "../../scripts/spike-lib.ts";

export type TickStats = {
  sent: number; landed: number; landedPct: number;
  p50: number; p95: number; p99: number; maxLatencyMs: number;
  maxGapMs: number; stallsOver1s: number; errors: string[];
};

export class Ticker {
  private running = false;
  private lat: number[] = [];
  private landedAt: number[] = [];
  private sent = 0;
  private errors = new Map<string, number>();
  private loop: Promise<void> | null = null;

  constructor(private S: RaidSession, private hz = 10) {}

  async start() {
    const [tick, fog] = await this.S.tickIxs();
    // One tx if it fits (1,232 B); otherwise tick and tick_raiders go as two txs per cycle.
    const probe = new Transaction().add(tick, fog);
    probe.feePayer = this.S.keeper.publicKey;
    probe.recentBlockhash = (await this.S.teeK.getLatestBlockhash()).blockhash;
    let together = true;
    try { probe.sign(this.S.keeper); probe.serialize(); } catch { together = false; }
    const batches = together ? [[tick, fog]] : [[tick], [fog]];
    this.running = true;
    const period = 1000 / this.hz;
    this.loop = (async () => {
      let next = performance.now();
      while (this.running) {
        for (const b of batches) {
          const t0 = performance.now();
          this.sent++;
          this.S.keeperFast(b)
            .then(() => { const t = performance.now(); this.lat.push(t - t0); this.landedAt.push(t); })
            .catch((e) => {
              const k = String(e).match(/custom program error: (0x[0-9a-f]+)|(\w+Error)/)?.[0] ?? String(e).slice(0, 60);
              this.errors.set(k, (this.errors.get(k) ?? 0) + 1);
            });
        }
        next += period;
        const wait = next - performance.now();
        if (wait > 0) await sleep(wait); else next = performance.now();
      }
    })();
    return together ? "tick+fog in one tx" : "tick and fog in separate txs";
  }

  async stop(): Promise<TickStats> {
    this.running = false;
    await this.loop;
    await sleep(2000);
    return this.stats();
  }

  stats(): TickStats {
    const s = [...this.lat].sort((a, b) => a - b);
    const q = (p: number) => (s.length ? Math.round(s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]) : NaN);
    const at = [...this.landedAt].sort((a, b) => a - b);
    let maxGap = 0, stalls = 0;
    for (let i = 1; i < at.length; i++) {
      const g = at[i] - at[i - 1];
      maxGap = Math.max(maxGap, g);
      if (g > 1000) stalls++;
    }
    return {
      sent: this.sent, landed: this.lat.length, landedPct: +((100 * this.lat.length) / Math.max(1, this.sent)).toFixed(2),
      p50: q(50), p95: q(95), p99: q(99), maxLatencyMs: Math.round(s[s.length - 1] ?? 0),
      maxGapMs: Math.round(maxGap), stallsOver1s: stalls,
      errors: [...this.errors.entries()].map(([k, v]) => `${k} ×${v}`),
    };
  }
}
