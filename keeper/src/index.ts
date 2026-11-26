// RAZKYN keeper CLI.
//   tsx keeper/src/index.ts [--mode mystery|live] [--slots 8] [--humans 0] [--human-wait 120] [--hz 10]
// --humans N reserves the first N slots for players joining from the client (waits up to
// --human-wait seconds); the remaining slots are filled with labelled BOT raiders.
import { runRaid } from "./raid.ts";
import { saveEvidence } from "../../scripts/spike-lib.ts";
import { WireServer } from "../wire/server.ts";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const slots = Number(arg("--slots", "8"));
const humans = Number(arg("--humans", "0"));
const wireServer = new WireServer();
await wireServer.listen();
console.log(`THE WIRE feed on http://localhost:${wireServer.port}/wire/<raidId>/stream`);
const out = await runRaid({
  mode: arg("--mode", "mystery") as "mystery" | "live" | "live-markets",
  slots,
  humanSlots: Array.from({ length: humans }, (_, i) => i),
  humanWaitSecs: Number(arg("--human-wait", "120")),
  hz: Number(arg("--hz", "10")),
  wireServer,
});
saveEvidence(`keeper-raid-${out.S.raidId.toString()}`, { reportHash: out.pub.hash, postReportSig: out.pub.sig, reportFile: out.pub.file, tick: out.tick, wire: out.wire });
// Keep serving the lobby, report and WIRE lines so the client can show the reveal and debrief.
const linger = Number(arg("--linger", "600"));
if (linger > 0) { console.log(`serving the report and WIRE for ${linger} s (--linger)`); await new Promise((r) => setTimeout(r, linger * 1000)); }
await wireServer.close();
process.exit(0);
