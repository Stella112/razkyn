// Read every RaiderPublic of a raid from the TEE (keeper token): alive / extracted / kills.
//   tsx scripts/check-rpub-tee.ts <raid_id>
import * as anchor from "@coral-xyz/anchor";
import { RaidSession } from "./raid-lib.ts";

const S = new RaidSession(new anchor.BN(process.argv[2]), 0);
await S.connectTee();
for (let s = 0; s < 8; s++) {
  const tee = await S.T.account.raiderPublic.fetch(S.slot("rpub", s)).catch(() => null) as { alive: boolean; extracted: boolean; kills: number } | null;
  const base = await S.P.account.raiderPublic.fetch(S.slot("rpub", s)).catch(() => null) as { alive: boolean } | null;
  console.log(`slot ${s}: tee alive=${tee?.alive} extracted=${tee?.extracted} kills=${tee?.kills} | base alive=${base?.alive}`);
}
process.exit(0);
