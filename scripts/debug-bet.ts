// Simulate an Extraction Market bet for a wallet (no signature needed) and print the logs.
//   tsx scripts/debug-bet.ts <wallet> <raid_id> <keeper_play_ata>
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Transaction, TransactionInstruction, VersionedTransaction } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { RaidSession, TOKEN, cfg } from "./raid-lib.ts";

const wallet = new PublicKey(process.argv[2]);
const S = new RaidSession(new anchor.BN(process.argv[3]), 0);
const PLAY = new PublicKey(cfg.mints.play);
const ata = getAssociatedTokenAddressSync(PLAY, wallet, false, TOKEN);
const pda = (...seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, S.P.programId)[0];
const tx = new Transaction();
tx.add(await S.P.methods.faucetPlay(new anchor.BN(100)).accountsPartial({
  config: S.config, ledger: pda(Buffer.from("faucet"), wallet.toBuffer()), mintAuth: S.mintAuth, mint: PLAY, userAta: ata, user: wallet,
  tokenProgram: TOKEN, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
}).instruction());
tx.add(createTransferCheckedInstruction(ata, PLAY, new PublicKey(process.argv[4]), wallet, 10n, 0, [], TOKEN));
tx.add(new TransactionInstruction({ programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"), keys: [{ pubkey: wallet, isSigner: true, isWritable: false }], data: Buffer.from(`razkyn-bet:${process.argv[3]}:0:Y`) }));
tx.feePayer = wallet;
tx.recentBlockhash = (await S.base.getLatestBlockhash()).blockhash;
const sim = await S.base.simulateTransaction(new VersionedTransaction(tx.compileMessage()), { sigVerify: false, replaceRecentBlockhash: true });
console.log(JSON.stringify(sim.value.err), "\n" + (sim.value.logs ?? []).join("\n"));
process.exit(0);
