// Delegation debugging (skill debugging.md runbook): for each account, router getDelegationStatus,
// base owner, ER owner, and the ER's own getDelegationStatus.
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { ROUTER_RPC, TEE_RPC, baseConn, loadKeypair, retryingFetch } from "./spike-lib.ts";
import { RaidSession } from "./raid-lib.ts";

const S = new RaidSession(new anchor.BN(process.argv[2]));
const base = baseConn();
const rpc = async (url: string, method: string, params: unknown[]) =>
  (await (await retryingFetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json()) as { result?: any; error?: any };
await S.connectTee();
const teeUrl = (S.teeK as unknown as { _rpcEndpoint: string })._rpcEndpoint;
const accts: [string, PublicKey][] = [["raid", S.raid], ["secret", S.secret], ["district0", S.district(0)], ["district1", S.district(1)], ["district2", S.district(2)], ["rpub0", S.slot("rpub", 0)], ["view0", S.slot("view", 0)], ["rprv0", S.slot("rprv", 0)]];
for (const [label, pk] of accts) {
  const router = await rpc(ROUTER_RPC, "getDelegationStatus", [pk.toBase58()]);
  const er = await rpc(teeUrl, "getDelegationStatus", [pk.toBase58()]);
  const b = await base.getAccountInfo(pk);
  const e = await S.teeK.getAccountInfo(pk).catch(() => null);
  console.log(label.padEnd(10), "router:", router.result?.isDelegated, router.result?.fqdn ?? router.error?.message, "| base owner:", b?.owner.toBase58().slice(0, 6), "| ER owner:", e?.owner.toBase58().slice(0, 6) ?? "(none)", "| ER isDelegated:", JSON.stringify(er.result ?? er.error?.message));
}
void loadKeypair; void TEE_RPC;
