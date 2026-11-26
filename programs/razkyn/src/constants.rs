//! Fixed numbers from CLAUDE.md §3. Change only with Maris's approval.

// ---------- seeds (CLAUDE.md §6.2) ----------
pub const CONFIG_SEED: &[u8] = b"config";
pub const MINT_AUTH_SEED: &[u8] = b"mint_auth";
pub const FAUCET_SEED: &[u8] = b"faucet";
pub const RAID_SEED: &[u8] = b"raid";
pub const ESCROW_SEED: &[u8] = b"escrow";
pub const DISTRICT_SEED: &[u8] = b"district";
pub const RPUB_SEED: &[u8] = b"rpub";
pub const RPRV_SEED: &[u8] = b"rprv";
pub const VIEW_SEED: &[u8] = b"view";
pub const SECRET_SEED: &[u8] = b"secret";

// ---------- raid ----------
pub const MAX_RAIDERS: usize = 8;
/// Other raiders a View can hold (MAX_RAIDERS - 1). A plain const so #[derive(InitSpace)] sizes it.
pub const VIEW_ENTRIES: usize = 7;
pub const MIN_RAIDERS: u8 = 2;
pub const RAID_SECS: i64 = 300;
pub const NUM_DISTRICTS: usize = 3;
pub const NUM_ASSETS: usize = 3;

// ---------- time ----------
/// Ticks advance at most once per this many ER slots. devnet-tee measured 9.8–10.5 ms/slot
/// (M0/S2, S4), so 10 slots ≈ 100 ms; the keeper sends slightly faster than 10 Hz.
pub const TICK_SLOTS: u64 = 10;

// ---------- map (tiles × 100, u16) ----------
pub const UNITS_PER_TILE: u16 = 100;
pub const MAP_W_TILES: u16 = 64;
pub const MAP_H_TILES: u16 = 40;
pub const MAX_X: u16 = MAP_W_TILES * UNITS_PER_TILE - 1; // 6399
pub const MAX_Y: u16 = MAP_H_TILES * UNITS_PER_TILE - 1; // 3999
/// District x ranges in tiles (inclusive): Tower 0–20, Factory 22–42, Harbor 44–63.
pub const DISTRICT_X_TILES: [(u16, u16); NUM_DISTRICTS] = [(0, 20), (22, 42), (44, 63)];

// ---------- movement ----------
/// 6 tiles/s = 60 units per 100 ms. One move may cover at most this much.
pub const MAX_STEP_UNITS: u64 = 60;
/// Speed budget per elapsed ER slot (60 units / 10 slots).
pub const SPEED_UNITS_PER_SLOT: u64 = 6;

// ---------- vision / combat ----------
pub const VISION_UNITS: u64 = 8 * UNITS_PER_TILE as u64; // 8 tiles
pub const MAX_HP: u8 = 100;

// ---------- exits ----------
pub const NUM_EXITS: usize = 4;
/// Exit points (tile coordinates): west, north, south and east edges. CLAUDE.md fixes the
/// count (4) but not the positions; see DECISIONS.md.
pub const EXIT_POINTS_TILES: [(u16, u16); NUM_EXITS] = [(1, 20), (32, 1), (32, 38), (62, 20)];
pub const EXIT_WINDOW_STARTS: [i64; 3] = [120, 210, 270];
pub const EXIT_WINDOW_SECS: i64 = 30;
pub const EXITS_PER_WINDOW: usize = 2;
pub const NO_EXIT: u8 = 255;

// ---------- economy (dUSD base units, 6 decimals) ----------
pub const DUSD_DECIMALS: u8 = 6;
pub const STAKE: u64 = 10_000_000; // 10 dUSD
pub const PROTECTED: u64 = 2_000_000; // 20% (DECISIONS #41)
pub const LOOT_POOL: u64 = 7_500_000; // 75% (DECISIONS #41)
pub const OPS_FEE: u64 = 500_000; // 5%
pub const FAUCET_DUSD_DAILY_CAP: u64 = 100_000_000; // 100 dUSD / wallet / day
pub const SECS_PER_DAY: i64 = 86_400;

// ---------- mystery slice ----------
pub const SLICE_STEPS: usize = 300;
pub const SLICE_LEN: usize = SLICE_STEPS * NUM_ASSETS; // 900 u32 (rebased ×10^4)

// ---------- VRF ----------
/// A pending VRF request may be superseded after this long (the devnet oracle stops
/// retrying a failed fulfilment after ~75 s, M0/S4).
pub const VRF_RETRY_SECS: i64 = 30;

// ---------- permissions ----------
/// RaiderPrivate: raid key + keeper. View: raid key. RaidSecret: keeper.
pub const RPRV_PERMISSION_MEMBERS: usize = 2;
pub const VIEW_PERMISSION_MEMBERS: usize = 1;
pub const SECRET_PERMISSION_MEMBERS: usize = 1;
pub const SECRET_PERM_BIT: u16 = 1 << 15;

// ---------- crates (M2) ----------
pub const CRATE_SEED: &[u8] = b"crate";
pub const NUM_CRATES: usize = 36;
pub const CRATES_PER_DISTRICT: usize = 12;
pub const ACTIVE_PER_DISTRICT: usize = 8;
/// Drop crates: index DROP_CRATE_BASE + slot (one per raider, used when they die).
pub const DROP_CRATE_BASE: u8 = 36;
pub const ALL_CRATES_PLACED: u64 = (1u64 << NUM_CRATES) - 1;
/// Price index 100.0000 (×10^4). At raid start one asset unit is worth one dUSD unit.
pub const PRICE_ONE: u64 = 1_000_000;

// ---------- channels / combat (ER slots, ~10 ms each) ----------
pub const CH_NONE: u8 = 0;
pub const CH_OPEN: u8 = 1;
pub const OPEN_CHANNEL_SLOTS: u64 = 200; // 2 s
pub const OPEN_RANGE_UNITS: u64 = UNITS_PER_TILE as u64; // 1 tile
pub const SHOOT_RANGE_UNITS: u64 = 6 * UNITS_PER_TILE as u64; // 6 tiles
pub const SHOT_DAMAGE: u8 = 34;
pub const SHOT_COOLDOWN_SLOTS: u64 = 50; // 500 ms

// ---------- market-driven map (bps vs raid start) ----------
pub const WAKE_BPS: i64 = 200; // ≥ +2% wakes dormant crates
pub const HAZARD1_BPS: i64 = -200; // ≤ −2% activates hazard tiles
pub const HAZARD2_BPS: i64 = -500; // ≤ −5% doubles the hazard area
/// 10 HP/s = 10 HP per 100 ER slots. Damage per tick is capped at 3 s worth.
pub const HAZARD_HP_PER_100_SLOTS: u64 = 10;
pub const HAZARD_MAX_SLOTS_PER_TICK: u64 = 300;
/// Hazard bands (tile rows, inclusive) inside the falling district.
pub const HAZARD1_ROWS: (u16, u16) = (16, 23);
pub const HAZARD2_ROWS: (u16, u16) = (12, 27);

// ---------- market (M3) ----------
/// Mystery slice upload: 3,600 bytes in 5 chunks of 720 (fits one TEE tx).
pub const SLICE_BYTES: usize = SLICE_LEN * 4;
pub const SLICE_CHUNK: usize = 720;
pub const SLICE_CHUNKS: u32 = (SLICE_BYTES / SLICE_CHUNK) as u32; // 5
pub const ALL_CHUNKS: u32 = (1 << SLICE_CHUNKS) - 1;
pub const MAX_PROOF_LEN: usize = 8; // up to 256 leaves
pub const DAY_ID_LEN: usize = 10; // "YYYY-MM-DD"

/// Live mode: district i tracks this Pricing Oracle feed. Lazer ids and exponents from
/// vendor/starter-kits/oracle-demo/pyth_lazer_list.json (SOL 6, BTC 1, ETH 2, all −8); the
/// addresses are the PDA [b"price_feed", b"pyth-lazer", id] under PriCems…, derived and
/// read on devnet-tee in M0/S3 (spikes/results/s3-oracle.json).
pub const ORACLE_PROGRAM_ID: anchor_lang::prelude::Pubkey =
    anchor_lang::prelude::pubkey!("PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd");
pub const LIVE_FEEDS: [anchor_lang::prelude::Pubkey; NUM_DISTRICTS] = [
    anchor_lang::prelude::pubkey!("ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu"), // SOL/USD (Tower)
    anchor_lang::prelude::pubkey!("71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr"), // BTC/USD (Factory)
    anchor_lang::prelude::pubkey!("5vaYr1hpv8yrSpu8w3K95x22byYxUJCCNCSYJtqVWPvG"), // ETH/USD (Harbor)
];
pub const FEED_MAX_AGE_SECS: i64 = 10;

// ---------- trades (M3) ----------
pub const CH_TRADE: u8 = 2;
pub const TRADE_CHANNEL_SLOTS: u64 = 300; // 3 s
/// Two terminals per district (tile coordinates). CLAUDE.md fixes the count, not positions.
pub const TERMINALS_TILES: [(u16, u16); 6] = [(5, 12), (15, 28), (27, 12), (37, 28), (49, 12), (59, 28)];
pub const TERMINAL_RANGE_UNITS: u64 = UNITS_PER_TILE as u64; // within 1 tile

// ---------- extraction + settlement (M4) ----------
pub const CH_EXTRACT: u8 = 3;
pub const EXTRACT_CHANNEL_SLOTS: u64 = 500; // 5 s
pub const EXIT_RANGE_UNITS: u64 = UNITS_PER_TILE as u64; // stand within 1 tile
pub const RESULTS_SEED: &[u8] = b"results";
pub const SETTLE_SEED: &[u8] = b"settle";
pub const CLAIM_SEED: &[u8] = b"claim";
pub const RESERVE_SEED: &[u8] = b"reserve";
/// settle_stuck_raid may run this long after the raid ended if finalize_raid never landed.
pub const SETTLE_STUCK_SECS: i64 = 120;

// ---------- v2 (2026-11-26): Live Markets, classes, market events (DECISIONS #35) ----------
/// Live Markets mode (mode 2): NVDA / TSLA / SOL (DECISIONS #41; was gold) from the MagicBlock Pricing Oracle on the
/// TEE. Lazer ids 1314, 1435 and the SOL/USD feed; PDAs read live on devnet-tee 2026-11-26 (scripts/check-feeds.ts).
pub const LIVE_MARKET_FEEDS: [anchor_lang::prelude::Pubkey; NUM_DISTRICTS] = [
    anchor_lang::prelude::pubkey!("3AD13yFytFWiLQbcGsnEXDeWZ9GZezSx6Y3NqZRoJMaC"), // Equity.US.NVDA/USD (Tower)
    anchor_lang::prelude::pubkey!("8L7ccCxTBZaLsMMdhAod5fFnpdEWGSDPW4y1td7y3y8N"), // Equity.US.TSLA/USD (Factory)
    anchor_lang::prelude::pubkey!("ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu"), // SOL/USD (Harbor)
];
/// Raider classes, chosen at join (stored in Raid.classes).
pub const CLASS_RAIDER: u8 = 0;
pub const CLASS_SCOUT: u8 = 1;
pub const CLASS_TRADER: u8 = 2;
pub const CLASS_GUNNER: u8 = 3;
pub const NUM_CLASSES: u8 = 4;
pub const SCOUT_VISION_UNITS: u64 = 10 * UNITS_PER_TILE as u64; // 10 tiles instead of 8
pub const TRADER_TRADE_SLOTS: u64 = 200; // 2 s instead of 3 s
pub const GUNNER_RANGE_UNITS: u64 = 7 * UNITS_PER_TILE as u64; // 7 tiles instead of 6
pub const GUNNER_COOLDOWN_SLOTS: u64 = 40; // 400 ms instead of 500 ms
/// Market events: two per raid, planned from the VRF seed (kind, district, second), private in
/// RaidSecret until they fire, committed by hash in Raid.event_plan_hash at the callback.
pub const EVENT_NONE: u8 = 0;
pub const EVENT_TRADING_HALT: u8 = 1; // the district's terminals close
pub const EVENT_RATE_SHOCK: u8 = 2; // every district's hazards trigger at -1% / -3%
pub const EVENT_EARNINGS: u8 = 3; // the district's dormant crates unlock
pub const NUM_EVENTS: usize = 2;
pub const EVENT_SECS: i64 = 30;
pub const EVENT_MIN_AT: u64 = 60;
pub const EVENT_AT_SPAN: u64 = 150; // fires between 60 s and 209 s
pub const SHOCK_HAZARD1_BPS: i64 = -100;
pub const SHOCK_HAZARD2_BPS: i64 = -300;
