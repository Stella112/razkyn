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
pub const PROTECTED: u64 = 4_000_000; // 40%
pub const LOOT_POOL: u64 = 5_500_000; // 55%
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
