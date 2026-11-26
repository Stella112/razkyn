// Per-viewer settings (this browser only). Every read and write is guarded: storage may be blocked.
export type Quality = "auto" | "high" | "low";
const get = (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch { /* storage blocked */ } };

export function loadQuality(): Quality { const q = get("razkyn-quality"); return q === "high" || q === "low" ? q : "auto"; }
export const saveQuality = (q: Quality) => set("razkyn-quality", q);
export const loadShowFps = () => get("razkyn-fps") === "1";
export const saveShowFps = (v: boolean) => set("razkyn-fps", v ? "1" : "0");
export const loadVoice = () => get("razkyn-voice") === "1";
export const saveVoice = (v: boolean) => set("razkyn-voice", v ? "1" : "0");
