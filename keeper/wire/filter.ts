// THE WIRE — output post-filter (CLAUDE.md §7). Runs on every line, model or template.
// Rejected output is replaced by a template line by the caller.

const TICKERS = [
  "BTC", "ETH", "SOL", "USDT", "USDC", "BNB", "XRP", "DOGE", "ADA", "AVAX", "DOT", "LINK", "MATIC", "LTC", "TRX", "SHIB",
  "BITCOIN", "ETHEREUM", "SOLANA", "TETHER", "RIPPLE", "DOGECOIN", "CARDANO",
];
const COMPANIES = [
  "BINANCE", "COINBASE", "FTX", "ALAMEDA", "KRAKEN", "TESLA", "APPLE", "NVIDIA", "MICROSOFT", "GOOGLE", "AMAZON", "META",
  "BLACKROCK", "GRAYSCALE", "MICROSTRATEGY", "TERRA", "LUNA", "CELSIUS", "GENESIS", "SEC", "FED", "FEDERAL RESERVE",
  "NASDAQ", "NYSE", "S&P", "DOW", "ROBINHOOD", "PAYPAL", "VISA", "JPMORGAN", "GOLDMAN", "OPENAI", "PYTH", "CHAINLINK",
];
const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
  "JAN", "FEB", "MAR", "APR", "JUN", "JUL", "AUG", "SEP", "SEPT", "OCT", "NOV", "DEC",
];

export type FilterContext = {
  /** Mystery reveal has happened (the day may now be named). */
  revealed: boolean;
  mode: "mystery" | "live";
  maxChars: number;
  /** Headline titles the line may quote (post-reveal debriefs only). */
  headlines?: string[];
};

const word = (w: string) => new RegExp(`(^|[^A-Z0-9])${w.replace(/[&.]/g, "\\$&")}([^A-Z0-9]|$)`);

/** Returns the reason a line is rejected, or null if it may ship. */
export function rejectReason(text: string, ctx: FilterContext): string | null {
  const s = text.trim();
  if (!s) return "empty";
  if (s.length > ctx.maxChars) return `too long (${s.length} > ${ctx.maxChars})`;
  if (/https?:\/\//i.test(s) && !ctx.revealed) return "url before reveal";
  const U = s.toUpperCase();
  // Company / institution names: never in Live mode ("price moves only"), and not before reveal.
  if (!(ctx.mode === "mystery" && ctx.revealed)) {
    for (const c of COMPANIES) if (word(c).test(U)) return `company ${c}`;
  }
  // Live mode plays real current assets, so there is nothing to spoil; Mystery hides the day until reveal.
  if (ctx.mode === "mystery" && !ctx.revealed) {
    if (s.includes("$")) return "$ price";
    for (const tk of TICKERS) if (word(tk).test(U)) return `ticker ${tk}`;
    for (const m of MONTHS) if (word(m).test(U)) return `month ${m}`;
    if (/(^|\D)(19|20)\d{2}(\D|$)/.test(s)) return "year";
    // Absolute prices: any number with 4+ digits (commas/decimals ignored) is treated as one.
    if (/\d[\d,]{3,}/.test(s.replace(/\.\d+/g, ""))) return "absolute number";
    if (/\d+\.\d{2,}(?!\s*%)/.test(s)) return "absolute decimal";
  }
  if (ctx.mode === "live" && s.includes("$")) return "$ price (live: relative moves only)";
  // Quotes must be real headlines (no invented news).
  const quoted = [...s.matchAll(/[“"]([^”"]{8,})[”"]/g)].map((m) => m[1]);
  for (const q of quoted) {
    if (!ctx.headlines?.some((h) => h.includes(q) || q.includes(h))) return "quote is not a listed headline";
  }
  return null;
}
