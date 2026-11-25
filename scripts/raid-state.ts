// Print where a raid stands: base owner of Raid/Results, settlement flags, claims (by raid id).
// usage: tsx scripts/raid-state.ts <raid_id>
import * as anchor from "@coral-xyz/anchor";
import { RaidSession } from "./raid-lib.ts";
const S = new RaidSession(new anchor.BN(process.argv[2]), 0);
const owner = async (pk: anchor.web3.PublicKey) => (await S.base.getAccountInfo(pk))?.owner.toBase58();
const st = await S.readSettlement();
console.log(JSON.stringify({
  raid: S.raid.toBase58(), raidOwnerBase: await owner(S.raid), resultsOwnerBase: await owner(S.results),
  settled: st.settled, settledVia: st.settledVia, claims: st.claims, dusdPaid: st.dusdPaid.toString(),
}, null, 2));
