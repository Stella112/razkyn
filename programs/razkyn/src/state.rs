//! Account layouts (CLAUDE.md §6.2). Every account stays well under 10,240 bytes so it can be
//! committed; sizes are noted on each struct (8-byte discriminator + INIT_SPACE).

use crate::constants::*;
use anchor_lang::prelude::*;

/// `["config"]`, base, public. Size: 8 + 260.
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub keeper: Pubkey,
    pub dusd_mint: Pubkey,
    /// dTWR, dFAC, dHRB (one per district).
    pub asset_mints: [Pubkey; NUM_ASSETS],
    pub play_mint: Pubkey,
    pub ops_treasury: Pubkey,
    pub token_program: Pubkey,
    pub bump: u8,
    pub mint_auth_bump: u8,
}

/// `["faucet", wallet]`, base. Enforces the 100 dUSD / wallet / day cap. Size: 8 + 57.
#[account]
#[derive(InitSpace)]
pub struct FaucetLedger {
    pub wallet: Pubkey,
    pub day: i64,
    pub dusd_today: u64,
    pub dusd_total: u64,
    pub bump: u8,
}

pub mod status {
    /// Created on base; accepting joins.
    pub const LOBBY: u8 = 0;
    /// VRF seed received; spawns/exits derived (TEE).
    pub const SEEDED: u8 = 1;
    /// Running (TEE).
    pub const LIVE: u8 = 2;
    /// 300 s elapsed (TEE). Settlement is M4.
    pub const ENDED: u8 = 3;
}

pub mod mode {
    pub const MYSTERY: u8 = 0;
    pub const LIVE: u8 = 1;
}

pub mod vrf_state {
    pub const NONE: u8 = 0;
    pub const PENDING: u8 = 1;
    pub const FULFILLED: u8 = 2;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace, PartialEq, Eq, Debug)]
pub struct CratePos {
    pub x: u16,
    pub y: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace, PartialEq, Eq, Debug)]
pub struct RaiderSlot {
    pub wallet: Pubkey,
    pub raid_key: Pubkey,
    pub stake: u64,
    pub joined: bool,
    pub alive: bool,
    pub extracted: bool,
    pub is_bot: bool,
}

/// `["raid", raid_id]`, base → TEE, public. Size: 8 + 981 = 989 bytes (measured on devnet).
#[account]
#[derive(InitSpace)]
pub struct Raid {
    pub raid_id: u64,
    pub keeper: Pubkey,
    pub mode: u8,
    pub status: u8,
    pub bump: u8,
    pub joined_count: u8,
    /// bit i = slot i permissions created; SECRET_PERM_BIT = RaidSecret permission created.
    pub perm_mask: u16,
    pub vrf_state: u8,
    pub vrf_nonce: u32,
    pub vrf_requested_ts: i64,
    /// Number of Merkle leaves (Mystery mode); 0 in Live mode.
    pub leaf_count: u32,
    pub created_ts: i64,
    pub start_ts: i64,
    pub start_slot: u64,
    pub end_ts: i64,
    pub tick_no: u64,
    pub last_tick_slot: u64,
    pub market_step: u16,
    /// Slot of the tick before last_tick_slot (hazard damage uses the gap).
    pub prev_tick_slot: u64,
    /// Bit i = crate i placed by place_crates (all 36 required to start).
    pub crates_placed: u64,
    /// Public crate positions (units), written by place_crates. Contents stay private until a
    /// crate is opened; district = idx / 12, dormant = idx % 12 >= 8. DECISIONS.md #16.
    pub crate_pos: [CratePos; NUM_CRATES],
    /// 0 = no window open, 1..=3 = that window is open.
    pub exit_window: u8,
    /// Exit indices open right now (NO_EXIT when closed). Copied from RaidSecret when a
    /// window opens, so the plan stays private until then.
    pub open_exits: [u8; EXITS_PER_WINDOW],
    pub raiders: [RaiderSlot; MAX_RAIDERS],
    pub day_root: [u8; 32],
    pub event_plan_hash: [u8; 32],
    pub settled: bool,
    pub report_hash: [u8; 32],
}

impl Raid {
    pub fn joined_mask(&self) -> u16 {
        let mut m = 0u16;
        for (i, r) in self.raiders.iter().enumerate() {
            if r.joined {
                m |= 1 << i;
            }
        }
        m
    }
    pub fn all_permissions_ready(&self) -> bool {
        let need = self.joined_mask() | SECRET_PERM_BIT;
        self.perm_mask & need == need
    }
}

/// `["district", raid_id, i]`, TEE, public. Size: 8 + 519.
#[account]
#[derive(InitSpace)]
pub struct District {
    pub raid_id: u64,
    pub index: u8,
    pub asset: u8,
    pub hazard_level: u8,
    pub bump: u8,
    /// Price index ×10^4 (100.0000 = 1_000_000 at raid start) in both modes.
    pub start_price: u64,
    pub current_price: u64,
    /// Live mode: raw oracle price at the first step (index = PRICE_ONE × raw / start_raw).
    pub start_raw: u64,
    /// Ring of the last 60 prices (one per market step).
    pub history: [u64; 60],
    pub hist_len: u8,
    pub hist_pos: u8,
    /// Bit per dormant crate woken in this district.
    pub awake_mask: u16,
    /// District reached +2% vs start at least once: its dormant crates can be opened.
    pub awake: bool,
}

/// `["rpub", raid_id, slot]`, TEE, public. Size: 8 + 21.
#[account]
#[derive(InitSpace)]
pub struct RaiderPublic {
    pub raid_id: u64,
    pub slot: u8,
    pub hp: u8,
    pub alive: bool,
    pub extracted: bool,
    /// Position is public only while trading, after death or after extraction.
    pub exposed: bool,
    pub is_bot: bool,
    pub kills: u8,
    pub pub_x: u16,
    pub pub_y: u16,
    /// Died to a hazard; `drop_backpack` still has to move the backpack into the drop crate.
    pub pending_drop: bool,
    pub bump: u8,
}

/// `["rprv", raid_id, slot]`, TEE, private (raid key + keeper). Size: 8 + 109.
#[account]
#[derive(InitSpace)]
pub struct RaiderPrivate {
    pub raid_id: u64,
    pub slot: u8,
    pub raid_key: Pubkey,
    pub x: u16,
    pub y: u16,
    pub last_move_slot: u64,
    /// Units per asset (dTWR, dFAC, dHRB), 6 decimals.
    pub backpack: [u64; NUM_ASSETS],
    pub channel_kind: u8,
    pub channel_arg: u8,
    pub channel_start_slot: u64,
    pub channel_units: u64,
    pub last_shot_slot: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace, PartialEq, Eq, Debug)]
pub struct ViewEntry {
    pub slot: u8,
    pub x: u16,
    pub y: u16,
}

/// `["view", raid_id, slot]`, TEE, private (raid key). Size: 8 + 54.
#[account]
#[derive(InitSpace)]
pub struct View {
    pub raid_id: u64,
    pub slot: u8,
    pub tick_no: u64,
    pub count: u8,
    pub entries: [ViewEntry; VIEW_ENTRIES],
    pub bump: u8,
}

/// `["secret", raid_id]`, TEE, private (keeper). Zero-copy. Size: 8 + 3,712.
/// Base-layer data is public, so nothing secret is written here until the account is on the
/// TEE and its permission exists (CLAUDE.md §4.4).
#[account(zero_copy)]
#[repr(C)]
pub struct RaidSecret {
    pub raid_id: u64,
    /// VRF seed (32 bytes) from the authenticated callback.
    pub seed: [u8; 32],
    pub slice_hash: [u8; 32],
    pub leaf_index: u32,
    pub loaded_chunks: u32,
    /// Exit plan: window w uses exits [2w], [2w+1]; NO_EXIT when unused.
    pub exit_plan: [u8; 8],
    pub seeded: u8,
    pub verified: u8,
    pub _pad: [u8; 2],
    /// Minute of day where the slice starts (set by verify_slice; revealed at the end).
    pub slice_start: u32,
    /// "YYYY-MM-DD" of the mystery day (first 10 bytes; set by verify_slice).
    pub day_id: [u8; 16],
    /// Mystery price slice: 300 steps × 3 assets, rebased ×10^4 (M3).
    pub slice: [u32; SLICE_LEN],
}

pub mod crate_state {
    pub const SEALED: u8 = 0;
    pub const OPENED: u8 = 1;
}

/// `["crate", raid_id, idx]`, TEE. idx 0..36: private (keeper) until opened, then public.
/// idx 36+slot: that raider's drop crate, public. Size: 8 + 71.
#[account]
#[derive(InitSpace)]
pub struct Crate {
    pub raid_id: u64,
    pub idx: u8,
    pub district: u8,
    pub dormant: bool,
    pub placed: bool,
    pub state: u8,
    pub x: u16,
    pub y: u16,
    /// Units per asset (dTWR, dFAC, dHRB). Regular crates hold one asset; drop crates hold a
    /// whole backpack.
    pub units: [u64; NUM_ASSETS],
    /// What the crate held when opened (public afterwards, for the report and THE WIRE).
    pub opened_units: [u64; NUM_ASSETS],
    /// Slot that opened it (255 = nobody).
    pub opened_by: u8,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace, PartialEq, Eq, Debug)]
pub struct RaiderResult {
    pub wallet: Pubkey,
    pub joined: bool,
    pub extracted: bool,
    pub alive: bool,
    /// Backpack at the end (units per asset).
    pub backpack: [u64; NUM_ASSETS],
    /// Units minted at claim (backpack, scaled when extracted value > loot pool).
    pub mint_units: [u64; NUM_ASSETS],
    /// dUSD value of mint_units at final prices (moved to the reserve as backing).
    pub mint_value: u64,
    /// dUSD paid at claim: protected slot + pro-rata leftover (+ dust for the lowest slot).
    pub dusd_payout: u64,
}

/// `["results", raid_id]`, TEE → base (committed by end_raid), public. Size: 8 + 896.
#[account]
#[derive(InitSpace)]
pub struct Results {
    pub raid_id: u64,
    pub computed: bool,
    pub ended_ts: i64,
    pub final_prices: [u64; NUM_ASSETS],
    pub stakes_total: u64,
    pub ops: u64,
    pub loot_pool: u64,
    /// Σ extracted backpack value at final prices before any scaling.
    pub extracted_value: u64,
    /// true when extracted value exceeded the loot pool and backpacks were scaled.
    pub scaled: bool,
    /// Loot pool left after extracted payouts; shared pro rata by stake.
    pub leftover: u64,
    pub reserve_total: u64,
    pub dusd_total: u64,
    pub raiders: [RaiderResult; MAX_RAIDERS],
    pub results_hash: [u8; 32],
    pub bump: u8,
}

/// `["settle", raid_id]`, base only, public. The `settled` flag (finalize_raid or
/// settle_stuck_raid) and claim accounting. Size: 8 + 92.
#[account]
#[derive(InitSpace)]
pub struct Settlement {
    pub raid_id: u64,
    pub settled: bool,
    /// 1 = finalize_raid (Magic Action), 2 = settle_stuck_raid.
    pub settled_via: u8,
    pub results_hash: [u8; 32],
    pub dusd_paid: u64,
    pub units_minted_value: u64,
    pub claims: u8,
    pub report_hash: [u8; 32],
    pub report_posted: bool,
    pub bump: u8,
}

/// `["claim", raid_id, slot]`, base only. Exists once claimed (idempotency). Size: 8 + 11.
#[account]
#[derive(InitSpace)]
pub struct ClaimRecord {
    pub raid_id: u64,
    pub slot: u8,
    pub claimed: bool,
    pub bump: u8,
}
