// Character & world customisation (cosmetic, saved in this browser only).
import { useState } from "react";
import OperatorPreview from "../game/OperatorPreview";
import {
  BOT_MODELS, HAIR_COLORS, HAIR_STYLES, PANTS, SKINS, TOPS, loadAvatar, loadBotModel, randomHuman, saveAvatar, saveBotModel, type HumanSpec,
} from "../game/three/actors";
import { THEMES, WEATHERS, getTheme, getWeather, setTheme, setWeather, type Theme, type Weather } from "../game/three/themes";

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

function Swatches({ list, value, onPick, label }: { list: number[]; value: number; onPick: (i: number) => void; label: string }) {
  return (
    <div className="cz-row"><span className="cz-l">{label}</span>
      <div className="cz-sw">{list.map((c, i) => <button key={i} aria-label={`${label} ${i + 1}`} className={value === i ? "on" : ""} style={{ background: hex(c) }} onClick={() => onPick(i)} />)}</div>
    </div>
  );
}

/** Avatar editor: build, skin, hair, clothes, randomise. Calls onChange with the saved spec. */
export function AvatarEditor({ value, onChange }: { value: HumanSpec; onChange: (a: HumanSpec) => void }) {
  const set = (p: Partial<HumanSpec>) => { const a = { ...value, ...p }; saveAvatar(a); onChange(a); };
  return (
    <div className="cz">
      <div className="cz-row"><span className="cz-l">Body</span>
        <div className="cz-seg">
          <button className={value.body === "m" ? "on" : ""} onClick={() => set({ body: "m" })}>MALE</button>
          <button className={value.body === "f" ? "on" : ""} onClick={() => set({ body: "f" })}>FEMALE</button>
          <button onClick={() => { const a = randomHuman(); saveAvatar(a); onChange(a); }}>RANDOMIZE</button>
        </div>
      </div>
      <Swatches label="Skin" list={SKINS} value={value.skin} onPick={(skin) => set({ skin })} />
      <div className="cz-row"><span className="cz-l">Hair</span>
        <div className="cz-seg wrap">{HAIR_STYLES.map((h, i) => <button key={h} className={value.hair === i ? "on" : ""} onClick={() => set({ hair: i })}>{h.toUpperCase()}</button>)}</div>
      </div>
      <Swatches label="Hair colour" list={HAIR_COLORS} value={value.hairColor} onPick={(hairColor) => set({ hairColor })} />
      <Swatches label="Jacket" list={TOPS} value={value.top} onPick={(top) => set({ top })} />
      <Swatches label="Trousers" list={PANTS} value={value.pants} onPick={(pants) => set({ pants })} />
    </div>
  );
}

export function BotPicker({ value, onChange }: { value: number; onChange: (m: number) => void }) {
  return (
    <div className="cz-row"><span className="cz-l">BOT style</span>
      <div className="cz-seg">{BOT_MODELS.map((b, i) => <button key={b} className={value === i ? "on" : ""} onClick={() => { saveBotModel(i); onChange(i); }}>{b}</button>)}</div>
    </div>
  );
}

export function WorldPicker({ theme, weather, onTheme, onWeather }: { theme: Theme; weather: Weather; onTheme: (t: Theme) => void; onWeather: (w: Weather) => void }) {
  return (
    <>
      <div className="cz-row"><span className="cz-l">Map</span>
        <div className="cz-seg">{THEMES.map((t) => <button key={t.id} className={theme === t.id ? "on" : ""} onClick={() => { setTheme(t.id); onTheme(t.id); }}>{t.name}</button>)}</div>
      </div>
      <div className="cz-row"><span className="cz-l">Time</span>
        <div className="cz-seg">{WEATHERS.map((w) => <button key={w.id} className={weather === w.id ? "on" : ""} onClick={() => { setWeather(w.id); onWeather(w.id); }}>{w.name}</button>)}</div>
      </div>
    </>
  );
}

/** Full-screen customise panel (title screen): preview + avatar + BOT style + map + time. */
export default function Customize({ onClose, onWorld }: { onClose: () => void; onWorld: (t: Theme, w: Weather) => void }) {
  const [avatar, setAvatar] = useState<HumanSpec>(loadAvatar());
  const [bot, setBot] = useState(loadBotModel());
  const [theme, setT] = useState<Theme>(getTheme());
  const [weather, setW] = useState<Weather>(getWeather());
  return (
    <div className="howto-wrap" onClick={onClose}>
      <div className="howto cz-panel" onClick={(e) => e.stopPropagation()}>
        <div className="howto-head"><span>CHARACTER & WORLD</span><button className="term-btn" onClick={onClose}>DONE</button></div>
        <div className="cz-grid">
          <div>
            <OperatorPreview cls={0} avatar={avatar} height={300} />
            <div className="cz-sub">BOTs look like this</div>
            <OperatorPreview cls={0} avatar={{ kind: "bot", model: bot }} look="bot" height={160} />
          </div>
          <div>
            <div className="howto-sub">YOUR RAIDER</div>
            <AvatarEditor value={avatar} onChange={setAvatar} />
            <div className="howto-sub" style={{ marginTop: 14 }}>BOTS</div>
            <BotPicker value={bot} onChange={setBot} />
            <div className="howto-sub" style={{ marginTop: 14 }}>WORLD</div>
            <WorldPicker theme={theme} weather={weather} onTheme={(t) => { setT(t); onWorld(t, weather); }} onWeather={(w) => { setW(w); onWorld(theme, w); }} />
            <p className="hs-d" style={{ marginTop: 12 }}>
              Looks only, saved in this browser. The rules, map and loot are the same for everyone. The chain does not store avatars,
              so other players see you as a human whose look comes from your wallet address.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
