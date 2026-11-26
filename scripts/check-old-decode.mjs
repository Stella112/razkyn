import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { readFileSync } from "node:fs";
const v2 = JSON.parse(readFileSync("app/src/lib/razkyn.json", "utf8"));
const v1 = JSON.parse(readFileSync("app/src/lib/razkyn.v1.json", "utf8"));
const conn = new Connection("https://rpc.magicblock.app/devnet");
const PID = new PublicKey(v2.address);
const id = new anchor.BN("1795688865968");
const raid = PublicKey.findProgramAddressSync([Buffer.from("raid"), id.toArrayLike(Buffer, "le", 8)], PID)[0];
const info = await conn.getAccountInfo(raid);
console.log("old raid bytes", info.data.length);
const mk = (idl) => new anchor.Program(idl, { connection: conn }).coder.accounts;
try { mk(v2).decode("raid", info.data); console.log("v2 decode: ok"); } catch (e) { console.log("v2 decode fails:", String(e).slice(0, 80)); }
const r = mk(v1).decode("raid", info.data); console.log("v1 decode ok, status", r.status, "settled", r.settled);
const sz = v2.types.find((t) => t.name === "Raid"); console.log("v2 Raid fields", sz.type.fields.slice(-5).map((f) => f.name).join(","));
