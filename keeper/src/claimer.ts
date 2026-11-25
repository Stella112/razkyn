// Claimer: claim for every joined raider of a settled raid (permissionless; the keeper pays fees).
// Also usable on its own to finish a raid whose keeper process stopped after settlement:
//   tsx keeper/src/claimer.ts <raid_id>
import * as anchor from "@coral-xyz/anchor";
import { RaidSession } from "../../scripts/raid-lib.ts";

export async function claimAll(S: RaidSession) {
  const res = (await S.readResultsBase())!.data as unknown as { raiders: { joined: boolean; wallet: anchor.web3.PublicKey }[] };
  const out: { slot: number; sig: string }[] = [];
  for (let s = 0; s < res.raiders.length; s++) {
    if (!res.raiders[s].joined) continue;
    // claim() only needs the payout wallet's public key.
    S.raiders[s] = S.raiders[s] ?? { wallet: { publicKey: res.raiders[s].wallet } as anchor.web3.Keypair, raidKey: anchor.web3.Keypair.generate(), bot: false };
    try { out.push({ slot: s, sig: await S.claim(s, S.keeper) }); }
    catch (e) { out.push({ slot: s, sig: String(e).includes("already in use") ? "already claimed" : `failed: ${String(e).slice(0, 80)}` }); }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const S = new RaidSession(new anchor.BN(process.argv[2]), 0);
  const st = await S.readSettlement();
  if (!st.settled) throw new Error("raid not settled");
  console.log(JSON.stringify(await claimAll(S), null, 2));
}
