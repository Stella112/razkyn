// S1 — PER (CLAUDE.md §10): Secret PDA delegated to MTEWGuqx…, EphemeralPermission created on
// the ER with wallet A as the only member, then read with A's and B's TEE tokens.
// Pass = A reads the value, B is refused / gets nothing.
// Prereq: tsx scripts/spike-setup.ts --id 1 --secret
// SDK: permissionPdaFromAccount, PERMISSION_PROGRAM_ID, MAGIC_PROGRAM_ID, EPHEMERAL_VAULT_ID
//      (vendor/ephemeral-rollups-sdk/ts/web3js/src/{pda.ts,constants.ts})
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  permissionPdaFromAccount, PERMISSION_PROGRAM_ID, MAGIC_PROGRAM_ID, EPHEMERAL_VAULT_ID,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import {
  TEE_RPC, loadKeypair, teeConn, spikeProgram, pdas, sendTee, waitVisible, routerStatus,
  saveEvidence, sleep,
} from "./spike-lib.ts";

const id = new anchor.BN(process.argv[2] ?? "1");
const SECRET_VALUE = new anchor.BN(424242);

const keeper = loadKeypair("keeper");
const A = loadKeypair("playerA");
const B = loadKeypair("playerB");
const teeK = await teeConn(keeper);
const program = spikeProgram(teeK, keeper);
const { secret } = pdas(program.programId, id);
const permission = permissionPdaFromAccount(secret);

await waitVisible(teeK, secret);
const createIx = await program.methods
  .createPermission(A.publicKey)
  .accountsPartial({
    secret, permission, authority: keeper.publicKey,
    permissionProgram: PERMISSION_PROGRAM_ID, ephemeralVault: EPHEMERAL_VAULT_ID, magicProgram: MAGIC_PROGRAM_ID,
  })
  .instruction();
const created = await sendTee(teeK, [createIx], [keeper]);
console.log("create_permission (TEE)", created.sig);
const writeIx = await program.methods
  .writeSecret(SECRET_VALUE)
  .accountsPartial({ secret, authority: keeper.publicKey })
  .instruction();
const written = await sendTee(teeK, [writeIx], [keeper]);
console.log("write_secret (TEE)", written.sig);

async function tryRead(label: string, conn: Connection, pk: PublicKey) {
  try {
    const info = await conn.getAccountInfo(pk);
    if (!info) return { reader: label, account: pk.toBase58(), result: "null (no data returned)" };
    let value: string | undefined;
    if (pk.equals(secret)) {
      const dec = program.coder.accounts.decode("secret", info.data) as { value: anchor.BN };
      value = dec.value.toString();
    }
    return { reader: label, account: pk.toBase58(), result: "data", owner: info.owner.toBase58(), len: info.data.length, value };
  } catch (e) {
    return { reader: label, account: pk.toBase58(), result: "error", error: String(e).slice(0, 300) };
  }
}

const teeA = await teeConn(A);
const teeB = await teeConn(B);
const noToken = new Connection(TEE_RPC, "confirmed");

// Permission propagation is asynchronous; poll A's read (bounded) instead of the SDK's
// waitUntilPermissionActive, which calls /permission (404 on devnet-tee per the skill, 2026-11-13).
let aRead = await tryRead("A (member)", teeA, secret);
for (let i = 0; i < 20 && aRead.value !== SECRET_VALUE.toString(); i++) {
  await sleep(500);
  aRead = await tryRead("A (member)", teeA, secret);
}
const reads = [
  aRead,
  await tryRead("B (non-member)", teeB, secret),
  await tryRead("keeper (non-member here)", teeK, secret),
  await tryRead("no token", noToken, secret),
  await tryRead("A (member)", teeA, permission),
  await tryRead("B (non-member)", teeB, permission),
];
console.table(reads.map((r) => ({ reader: r.reader, account: r.account.slice(0, 8), result: r.result, value: (r as { value?: string }).value ?? "" })));

const aOk = aRead.result === "data" && aRead.value === SECRET_VALUE.toString();
const bRead = reads[1];
const bRefused = bRead.result !== "data" || (bRead as { value?: string }).value !== SECRET_VALUE.toString();
const pass = aOk && bRefused;
console.log(pass ? "S1 PASS" : "S1 FAIL");
saveEvidence("s1-per", {
  when: new Date().toISOString(), pass, secret: secret.toBase58(), permission: permission.toBase58(),
  memberA: A.publicKey.toBase58(), nonMemberB: B.publicKey.toBase58(),
  teeSigs: { createPermission: created.sig, writeSecret: written.sig },
  routerStatus: await routerStatus(secret), reads,
});
