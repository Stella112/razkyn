// Lobby profiles (handle + READY): signature and input checks, without a raid.
// A wrong key or tampered field must fail before any chain read; a good signature reaches the
// on-chain seat check ("unknown raid" for a raid id that does not exist).
//   tsx scripts/check-profile-verify.ts
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import { AvatarBook, profileMessage, sanitizeHandle } from "../keeper/wire/avatars.ts";

const book = new AvatarBook();
const kp = Keypair.generate(), other = Keypair.generate();
const raidId = "1", slot = 0;
const body = (h: string, ready: boolean, signer: Keypair, signedHandle = h) => ({
  raidId, slot, handle: h, ready, pubkey: kp.publicKey.toBase58(),
  sig: Buffer.from(nacl.sign.detached(profileMessage(raidId, slot, signedHandle, ready), signer.secretKey)).toString("base64"),
});
const cases: [string, Promise<string | null>, (r: string | null) => boolean][] = [
  ["good signature reaches the on-chain seat check", book.submitProfile(body("Maris", true, kp)), (r) => r === "unknown raid"],
  ["signed by another key", book.submitProfile(body("Maris", true, other)), (r) => r === "signature does not verify"],
  ["handle changed after signing", book.submitProfile(body("Mallory", true, kp, "Maris")), (r) => r === "signature does not verify"],
  ["handle posing as a BOT", book.submitProfile(body("BOT 3", true, kp)), (r) => r === "bad request"],
  ["handle too long", book.submitProfile(body("x".repeat(17), true, kp)), (r) => r === "bad request"],
  ["handle with markup", book.submitProfile(body("<b>hi</b>", true, kp)), (r) => r === "bad request"],
];
let ok = true;
for (const [name, p, want] of cases) { const r = await p; const pass = want(r); ok &&= pass; console.log(`${pass ? "PASS" : "FAIL"} ${name}: ${r}`); }
console.log(`${sanitizeHandle("  Night Owl ") === "Night Owl" ? "PASS" : "FAIL"} trims handles`);
console.log(`${book.allReady(raidId, [0]) ? "FAIL" : "PASS"} nobody ready without a verified profile`);
process.exit(ok ? 0 : 1);
