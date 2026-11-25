// Market Raid Report (CLAUDE.md §8): canonical JSON, sha256, hash posted on-chain via
// post_report_hash, file hosted as a static asset (app/public/reports/<raidId>.json).
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RaidSession } from "../../scripts/raid-lib.ts";
import { REPO, sendBase } from "../../scripts/spike-lib.ts";

/** Canonical JSON: object keys sorted recursively, no whitespace. The report page uses the same rule. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export function reportHash(report: unknown): string {
  return createHash("sha256").update(canonical(report), "utf8").digest("hex");
}

/** Write the report file and post its hash on-chain (keeper, once per raid). */
export async function publishReport(S: RaidSession, report: Record<string, unknown>) {
  const hash = reportHash(report);
  const ix = await S.P.methods.postReportHash(Array.from(Buffer.from(hash, "hex"))).accountsPartial({
    settlement: S.settlement, config: S.config, keeper: S.keeper.publicKey,
  }).instruction();
  const sig = await sendBase(S.base, [ix], [S.keeper]);
  const dir = join(REPO, "app", "public", "reports");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${S.raidId.toString()}.json`);
  // `report` is what is hashed; `hash` and `postReportSig` sit outside it.
  writeFileSync(file, JSON.stringify({ report, hash, postReportSig: sig }, null, 2));
  return { hash, sig, file };
}
