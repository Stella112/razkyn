// Shared avatars: a player's chosen look (cosmetic only), signed with their raid key.
// The keeper accepts it only if the signing key is the raid key registered on-chain for that seat
// (Raid.raiders[slot].raid_key on the base layer, written by join_raid), so nobody can set another
// player's avatar. Avatars live in memory for recent raids; nothing here affects rules or payouts.
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import { PID, idl } from "../../scripts/raid-lib.ts";
import { baseConn } from "../../scripts/spike-lib.ts";

export type HumanAvatar = { kind: "human"; body: "m" | "f"; skin: number; hair: number; hairColor: number; top: number; pants: number };
/** Ranges match app/src/game/three/actors.ts (SKINS 6, HAIR_STYLES 6, HAIR_COLORS 6, TOPS 6, PANTS 4). */
const LIMITS = { skin: 6, hair: 6, hairColor: 6, top: 6, pants: 4 } as const;

/** Rebuild from a whitelist; anything else is dropped. */
export function sanitizeAvatar(a: unknown): HumanAvatar | null {
  const o = (a ?? {}) as Record<string, unknown>;
  if (o.kind !== "human" || (o.body !== "m" && o.body !== "f")) return null;
  const out: HumanAvatar = { kind: "human", body: o.body, skin: 0, hair: 0, hairColor: 0, top: 0, pants: 0 };
  for (const [k, n] of Object.entries(LIMITS) as [keyof typeof LIMITS, number][]) {
    const v = o[k];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= n) return null;
    out[k] = v;
  }
  return out;
}

/** The exact bytes the client signs (stable key order). */
export const avatarMessage = (raidId: string, slot: number, a: HumanAvatar) =>
  new TextEncoder().encode(`razkyn-avatar:${raidId}:${slot}:${a.body}:${a.skin}:${a.hair}:${a.hairColor}:${a.top}:${a.pants}`);

type RaidSeat = { joined: boolean; isBot: boolean; raidKey: PublicKey };

export class AvatarBook {
  private byRaid = new Map<string, Map<number, HumanAvatar>>();
  private coder = new anchor.Program(idl, new anchor.AnchorProvider(baseConn(), new anchor.Wallet(Keypair.generate()), {})).coder.accounts;

  get(raidId: string) { return Object.fromEntries(this.byRaid.get(raidId) ?? []); }

  /** Verify signature + on-chain raid key for the seat, then store. Returns an error string or null. */
  async submit(body: { raidId?: unknown; slot?: unknown; avatar?: unknown; pubkey?: unknown; sig?: unknown }): Promise<string | null> {
    const raidId = typeof body.raidId === "string" && /^\d{1,20}$/.test(body.raidId) ? body.raidId : null;
    const slot = typeof body.slot === "number" && Number.isInteger(body.slot) && body.slot >= 0 && body.slot < 8 ? body.slot : null;
    const avatar = sanitizeAvatar(body.avatar);
    if (raidId === null || slot === null || !avatar) return "bad request";
    let key: PublicKey, sig: Uint8Array;
    try { key = new PublicKey(String(body.pubkey)); sig = Uint8Array.from(Buffer.from(String(body.sig), "base64")); } catch { return "bad key or signature encoding"; }
    if (sig.length !== 64 || !nacl.sign.detached.verify(avatarMessage(raidId, slot, avatar), sig, key.toBytes())) return "signature does not verify";
    const raidPda = PublicKey.findProgramAddressSync([Buffer.from("raid"), new anchor.BN(raidId).toArrayLike(Buffer, "le", 8)], PID)[0];
    const info = await baseConn().getAccountInfo(raidPda);
    if (!info) return "unknown raid";
    let seat: RaidSeat | undefined;
    try { seat = (this.coder.decode("raid", info.data) as { raiders: RaidSeat[] }).raiders[slot]; } catch { return "raid account not readable"; }
    if (!seat?.joined || seat.isBot) return "not a human seat";
    if (!seat.raidKey.equals(key)) return "not the raid key for this seat";
    if (!this.byRaid.has(raidId)) {
      this.byRaid.set(raidId, new Map());
      while (this.byRaid.size > 20) this.byRaid.delete(this.byRaid.keys().next().value!); // keep recent raids only
    }
    this.byRaid.get(raidId)!.set(slot, avatar);
    return null;
  }
}
