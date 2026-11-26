// Checks keeper/wire/avatars.ts rejects forged avatars against a real settled raid on devnet.
// Usage: tsx scripts/check-avatar-verify.ts <raid_id> <human_slot> <bot_slot>
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import { AvatarBook, avatarMessage, type HumanAvatar } from "../keeper/wire/avatars.ts";
const [raidId, human, bot] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4])];
const book = new AvatarBook();
const a: HumanAvatar = { kind: "human", body: "f", skin: 2, hair: 4, hairColor: 1, top: 3, pants: 1 };
const k = Keypair.generate();
const sign = (slot: number, av = a) => Buffer.from(nacl.sign.detached(avatarMessage(raidId, slot, av), k.secretKey)).toString("base64");
const cases: [string, Record<string, unknown>][] = [
  ["bad avatar (hair 99)", { raidId, slot: human, avatar: { ...a, hair: 99 }, pubkey: k.publicKey.toBase58(), sig: sign(human) }],
  ["signature over other data", { raidId, slot: human, avatar: { ...a, skin: 5 }, pubkey: k.publicKey.toBase58(), sig: sign(human) }],
  ["valid signature, wrong key for the seat", { raidId, slot: human, avatar: a, pubkey: k.publicKey.toBase58(), sig: sign(human) }],
  ["BOT seat", { raidId, slot: bot, avatar: a, pubkey: k.publicKey.toBase58(), sig: sign(bot) }],
];
for (const [name, body] of cases) console.log(`${name.padEnd(42)} → ${await book.submit(body)}`);
console.log("stored:", JSON.stringify(book.get(raidId)));
process.exit(0);
