// Watch-mode spectator panel: RAZKYN LIVE on-chain picks (LivePicks.tsx). The earlier keeper-run dPLAY
// Extraction Market (DECISIONS #33/#38) is superseded in the UI by the on-chain picks (DECISIONS #39);
// the keeper still records any dPLAY bets for the report.
import { useState } from "react";
import type { PublicState } from "../lib/chain";
import LivePicks from "./LivePicks";

export default function Market({ raidId, pub }: { raidId: string; pub: PublicState | null }) {
  const [open, setOpen] = useState(true);
  if (!pub?.raid) return null;
  return (
    <div className="hud-box market">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="label neon-a" style={{ letterSpacing: "0.14em" }}>SPECTATOR · RAZKYN LIVE</div>
        <button className="act mute" onClick={() => setOpen((o) => !o)}>{open ? "–" : "+"}</button>
      </div>
      {open && <LivePicks raidId={raidId} pub={pub} />}
    </div>
  );
}
