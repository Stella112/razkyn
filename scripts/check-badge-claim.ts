// Devnet check: the badge was minted once, and a second claim_badge is refused by badge_claimed (6047 AlreadyClaimed).
//   tsx scripts/check-badge-claim.ts <raid_id>
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { RaidSession, TOKEN } from "./raid-lib.ts";
import { sendBase } from "./spike-lib.ts";
import { decodeBook } from "../keeper/src/livepicks.ts";
const S = new RaidSession(new anchor.BN(process.argv[2]), 0);
const pda = (...s: Buffer[]) => PublicKey.findProgramAddressSync(s, S.P.programId)[0];
const book = pda(Buffer.from("picks"), S.raidId.toArrayLike(Buffer, "le", 8)), mint = pda(Buffer.from("badge_mint"));
const info = (await S.base.getAccountInfo(book))!;
const b = decodeBook(info.data);
console.log("book on base, owner = program:", info.owner.equals(S.P.programId), "status", b.status);
for (const [i, s] of b.spectators.entries()) {
  const ata = getAssociatedTokenAddressSync(mint, new PublicKey(s.wallet), false, TOKEN);
  const bal = await S.base.getTokenAccountBalance(ata).then((x) => x.value.amount).catch(() => "0");
  console.log(`spectator ${i} ${s.wallet.slice(0, 6)}… credits ${s.credits} correct ${s.correct}/${s.picks} best streak ${s.bestStreak} badge ${s.badge} claimed ${s.badgeClaimed} · badge tokens ${bal}`);
  if (!s.badge) continue;
  try {
    await sendBase(S.base, [await S.P.methods.claimBadge(S.raidId, i).accountsPartial({ config: S.config, book, mintAuth: S.mintAuth, badgeMint: mint, wallet: new PublicKey(s.wallet), walletAta: ata, payer: S.keeper.publicKey, tokenProgram: TOKEN, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID }).instruction()], [S.keeper]);
    console.log("  SECOND CLAIM ACCEPTED (bug)");
  } catch (e) { const m = /custom program error: 0x([0-9a-f]+)/i.exec(String(e)); console.log(`  second claim refused: ${m ? parseInt(m[1], 16) : String(e).slice(0, 90)} (6047 = AlreadyClaimed)`); }
}
console.log("credits total", b.spectators.reduce((a, s) => a + s.credits, 0), "for", b.spectators.length, "spectators");
process.exit(0);
