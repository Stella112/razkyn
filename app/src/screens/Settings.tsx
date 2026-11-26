// Settings: sound, THE WIRE voice, graphics quality, FPS counter, lobby handle, controls.
// Everything here is cosmetic and stored in this browser only; nothing changes game rules.
import { useState } from "react";
import { navigate } from "../App";
import { sfx } from "../lib/sfx";
import { loadQuality, loadShowFps, loadVoice, saveQuality, saveShowFps, saveVoice, type Quality } from "../lib/prefs";
import { loadHandle, saveHandle, validHandle } from "../lib/keeper";

const CONTROLS: [string, string][] = [
  ["W A S D / touch stick", "Move (max 6 tiles/s, checked on-chain)"],
  ["Click / tap a raider", "Shoot (range and cooldown checked on-chain)"],
  ["E", "Crack a sealed crate (2 s) · trade at a terminal (3 s, position public)"],
  ["Hold Space", "Extract at an open exit (5 s)"],
  ["Tab", "Inventory: protected slot, units, value, concentration"],
  ["M", "Full city map"],
  ["H", "How to play"],
  ["Esc", "Close any panel"],
];

export default function Settings() {
  const [muted, setMuted] = useState(sfx.muted);
  const [voice, setVoice] = useState(loadVoice());
  const [quality, setQuality] = useState<Quality>(loadQuality());
  const [fps, setFps] = useState(loadShowFps());
  const [handle, setHandle] = useState(loadHandle());
  const handleOk = !handle.trim() || validHandle(handle);
  return (
    <div className="page">
      <div className="wrap" style={{ maxWidth: 760 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 18 }}>
          <a className="brand" href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }}>R A Z K Y N</a>
          <button className="btn" onClick={() => navigate("/")}>Back</button>
        </div>
        <div className="card">
          <h3>SETTINGS</h3>
          <p className="note">Saved in this browser only. None of these change the game rules.</p>
          <div className="kv settings-kv">
            <span>Sound effects</span>
            <span><button className={`btn ${muted ? "" : "primary"}`} onClick={() => setMuted(sfx.toggle())}>{muted ? "OFF" : "ON"}</button></span>
            <span>THE WIRE voice</span>
            <span><button className={`btn ${voice ? "primary" : ""}`} onClick={() => { const v = !voice; saveVoice(v); setVoice(v); if (!v) window.speechSynthesis?.cancel(); }}>{voice ? "ON" : "OFF"}</button> <span className="dim" style={{ fontSize: 12 }}>browser text-to-speech</span></span>
            <span>Graphics</span>
            <span className="row" style={{ gap: 6 }}>
              {(["auto", "high", "low"] as Quality[]).map((q) => (
                <button key={q} className={`btn ${quality === q ? "primary" : ""}`} onClick={() => { saveQuality(q); setQuality(q); }}>{q.toUpperCase()}</button>
              ))}
              <span className="dim" style={{ fontSize: 12, flexBasis: "100%" }}>
                {quality === "auto" ? "Bloom on; drops to low if frames average over 25 ms." : quality === "high" ? "Bloom and reflections always on." : "No bloom, pixel ratio 1: for older laptops and phones."}
              </span>
            </span>
            <span>FPS counter</span>
            <span><button className={`btn ${fps ? "primary" : ""}`} onClick={() => { saveShowFps(!fps); setFps(!fps); }}>{fps ? "ON" : "OFF"}</button></span>
            <span>Lobby handle</span>
            <span>
              <input className="handle-in" maxLength={16} value={handle} placeholder="Raider" onChange={(e) => { setHandle(e.target.value); if (!e.target.value.trim() || validHandle(e.target.value)) saveHandle(e.target.value.trim()); }} />
              {!handleOk && <div className="err">1–16 letters, digits, space, _ or -, not starting with BOT.</div>}
            </span>
            <span>Character, map, time of day</span>
            <span><button className="btn" onClick={() => navigate("/play")}>Edit in the lobby</button></span>
          </div>
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <h3>CONTROLS</h3>
          <div className="kv">{CONTROLS.map(([k, v]) => [<span key={k} className="mono">{k}</span>, <span key={k + "v"}>{v}</span>])}</div>
        </div>
      </div>
    </div>
  );
}
