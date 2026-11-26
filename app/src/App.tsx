import { Component, useEffect, useState, type ReactNode } from "react";

/** Shows a readable error instead of a blank screen. */
class Boundary extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { err: String((e as Error)?.message ?? e) }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="page"><div className="wrap"><div className="card">
        <h3>Something broke</h3><p className="err mono">{this.state.err}</p>
        <button className="btn" onClick={() => window.location.reload()}>Reload</button>
      </div></div></div>
    );
  }
}
import Landing from "./screens/Landing";
import Lobby from "./screens/Lobby";
import Raid from "./screens/Raid";
import Report from "./screens/Report";
import History from "./screens/History";

/** Tiny path router: /, /play, /raid/:id, /watch[/:id], /report/:id. */
export function navigate(path: string) {
  window.history.pushState({}, "", path + window.location.search);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const on = () => setPath(window.location.pathname);
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  const parts = path.split("/").filter(Boolean);
  const screen =
    parts[0] === "play" ? <Lobby /> :
    parts[0] === "raid" && parts[1] ? <Raid key={`r${parts[1]}`} raidId={parts[1]} watch={false} /> :
    parts[0] === "watch" ? <Raid key={`w${parts[1] ?? ""}`} raidId={parts[1] ?? ""} watch /> :
    parts[0] === "report" && parts[1] ? <Report raidId={parts[1]} /> :
    parts[0] === "history" ? <History /> :
    <Landing />;
  return <Boundary key={path}>{screen}</Boundary>;
}
