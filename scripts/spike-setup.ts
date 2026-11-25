// Create + delegate a spike Probe (and optionally its Secret) to the TEE validator.
// usage: tsx scripts/spike-setup.ts --id <n> [--secret] [--min-tick-slots <n>]
import * as anchor from "@coral-xyz/anchor";
import {
  baseConn, loadKeypair, spikeProgram, pdas, sendBase, baseTx, routerStatus, TEE_VALIDATOR, saveEvidence,
} from "./spike-lib.ts";

const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const id = new anchor.BN(arg("--id")!);
const withSecret = process.argv.includes("--secret");
const minTickSlots = new anchor.BN(arg("--min-tick-slots", "0")!);

const keeper = loadKeypair("keeper");
const raidKey = loadKeypair("raidkey");
const base = baseConn();
const program = spikeProgram(base, keeper);
const p = pdas(program.programId, id);

const initIx = await program.methods
  .init(id, raidKey.publicKey, minTickSlots)
  .accountsPartial({ probe: p.probe, secret: p.secret, flag: p.flag, authority: keeper.publicKey })
  .instruction();
const delProbe = await program.methods
  .delegatePda({ probe: { id } })
  .accountsPartial({ pda: p.probe, payer: keeper.publicKey, validator: TEE_VALIDATOR })
  .instruction();
const ixs = [initIx, delProbe];
if (withSecret) {
  ixs.push(
    await program.methods
      .delegatePda({ secret: { id } })
      .accountsPartial({ pda: p.secret, payer: keeper.publicKey, validator: TEE_VALIDATOR })
      .instruction(),
  );
}
const sig = await sendBase(base, ixs, [keeper]);
console.log("init+delegate", sig, baseTx(sig));
const status = {
  probe: await routerStatus(p.probe),
  secret: withSecret ? await routerStatus(p.secret) : null,
};
console.log(JSON.stringify(status, null, 2));
saveEvidence(`setup-${id.toString()}`, {
  id: id.toString(), programId: program.programId.toBase58(),
  pdas: { probe: p.probe.toBase58(), secret: p.secret.toBase58(), flag: p.flag.toBase58() },
  delegateSig: sig, explorer: baseTx(sig), routerStatus: status,
});
