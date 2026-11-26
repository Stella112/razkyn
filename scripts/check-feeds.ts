// Is a Pyth Lazer feed republished by MagicBlock's Pricing Oracle on devnet? Reads the feed PDA
// [b"price_feed", b"pyth-lazer", <id>] under PriCems… on devnet-tee (and the base layer), and prints
// owner, size, and the publish time / price fields as decoded by the receiver SDK layout.
//   tsx scripts/check-feeds.ts 6 1314 1435 346 163
import { Connection, PublicKey } from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";
import { teeConn } from "./spike-lib.ts";

const ORACLE = new PublicKey("PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd");
const tee = await teeConn(Keypair.generate());
const base = new Connection("https://rpc.magicblock.app/devnet", "confirmed");
for (const id of process.argv.slice(2)) {
  const pda = PublicKey.findProgramAddressSync([Buffer.from("price_feed"), Buffer.from("pyth-lazer"), Buffer.from(id)], ORACLE)[0];
  const [t, b] = await Promise.all([tee.getAccountInfo(pda), base.getAccountInfo(pda)]);
  // PriceUpdateV2 layout: 8 disc | 32 write_authority | 1 verification_level (+1 if Partial) | 32 feed_id | 8 price | 8 conf | 4 exponent | 8 publish_time | 8 prev_publish_time | 8 ema_price | 8 ema_conf | 8 posted_slot
  const dec = (d: Buffer | undefined) => {
    if (!d || d.length < 133) return null;
    const lvl = d[40]; let o = 41 + (lvl === 0 ? 1 : 0);
    o += 32;
    const price = d.readBigInt64LE(o); o += 16; o += 4;
    const pub = Number(d.readBigInt64LE(o));
    const posted = d.readBigUInt64LE(d.length - 8);
    return { price: price.toString(), ageSec: Math.round(Date.now() / 1000 - pub), postedSlot: posted.toString() };
  };
  console.log(id, pda.toBase58(), "| TEE:", t ? `${t.owner.toBase58().slice(0, 8)} ${t.data.length}B ${JSON.stringify(dec(t.data))}` : "none", "| base:", b ? `${b.owner.toBase58().slice(0, 8)} ${b.data.length}B` : "none");
}
process.exit(0);
