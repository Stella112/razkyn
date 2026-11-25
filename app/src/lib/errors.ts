// RazkynError (programs/razkyn/src/errors.rs): code = 6000 + index.
const NAMES = [
  "Overflow", "Unauthorized", "BadStatus", "BadSlot", "SlotTaken", "AlreadyJoined", "BadRaidKey", "SlotNotJoined", "NotEnoughRaiders", "WrongRaidKey",
  "RaiderDead", "RaiderExtracted", "RaidOver", "TooFast", "OutOfBounds", "FaucetCap", "PermissionsMissing", "VrfPending", "VrfMismatch", "NotSeeded",
  "BadAccount", "TooManyMembers", "BadMint", "BadMode", "CrateNotOpenable", "CrateDormant", "OutOfRange", "NoChannel", "ChannelNotDone", "BadTarget",
  "Cooldown", "CratesNotPlaced", "BadChunk", "SliceNotLoaded", "BadProof", "SliceNotVerified", "NotAtTerminal", "Trading", "BadTrade", "InsufficientUnits",
  "BadFeed", "ExitClosed", "NotEnded", "AlreadyComputed", "Conservation", "NotSettled", "AlreadySettled", "AlreadyClaimed", "TooEarly", "NotCommitted",
  "ForcedFailure",
];
const FRIENDLY: Record<string, string> = {
  OutOfRange: "Out of range", Cooldown: "Weapon cooling down", CrateDormant: "Dormant crate: its district must rise 2% first",
  CrateNotOpenable: "Already opened", NotAtTerminal: "Stand on a terminal", Trading: "Finish your trade first", ExitClosed: "That exit is closed",
  RaiderDead: "You are down", RaiderExtracted: "You already extracted", RaidOver: "Raid over", ChannelNotDone: "Hold on, still channelling",
  InsufficientUnits: "Nothing to trade", BadTarget: "No valid target", FaucetCap: "Faucet cap reached (100 dUSD per day)",
};
export function programError(e: unknown): string {
  const s = String((e as Error)?.message ?? e);
  const m = /custom program error: 0x([0-9a-f]+)/i.exec(s) ?? /"Custom":(\d+)/.exec(s);
  if (!m) return s.slice(0, 120);
  const code = m[0].includes("0x") ? parseInt(m[1], 16) : Number(m[1]);
  const name = NAMES[code - 6000];
  return name ? FRIENDLY[name] ?? name : `error ${code}`;
}
