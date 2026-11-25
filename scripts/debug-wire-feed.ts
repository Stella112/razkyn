// One poll of THE WIRE's public feed for a raid, with errors surfaced (debugging aid).
//   tsx scripts/debug-wire-feed.ts <raid_id>
import * as anchor from "@coral-xyz/anchor";
import { PublicFeed } from "../keeper/wire/facts.ts";

const f = new PublicFeed(new anchor.BN(process.argv[2]), (x) => console.log("fact", JSON.stringify(x)));
await f.start();
await f.stop();
try { await f.poll(); } catch (e) { console.log("poll error:", e); }
console.log("facts", f.facts.length);
process.exit(0);
