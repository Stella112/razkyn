//! RAZKYN LIVE — on-chain spectator micro-picks (owner add-on, DECISIONS #39).
//!
//! One `PickBook` per raid (`["picks", raid_id]`), created on base, delegated to the TEE with the raid.
//! It is PUBLIC (no permission): anyone can read pools, outcomes and the leaderboard.
//!   register_spectator  (TEE, wallet signs once)  binds a session key to the wallet + 100 play credits
//!   place_pick          (TEE, session key signs)  one choice per pool; locks by the program clock
//!   resolve_picks       (TEE, anyone / crank)     outcomes from PUBLIC accounts only: Raid, District×3,
//!                                                 RaiderPublic×8. Pays each pool the moment it resolves.
//!   schedule_pick_crank (TEE, payer)              ScheduleCrankCpi (1.x scheduler) runs resolve_picks every second
//!   cancel_picks        (TEE, keeper)             cancelled / failed raid: every open pool is refunded
//!   close_picks         (TEE, anyone)             after all pools resolved: streak badges from the raid's VRF seed,
//!                                                 then commit + undelegate the book to Solana
//!   claim_badge         (base, anyone)            mints 1 transferable devnet badge token to a streak winner
//! Credits are non-redeemable play credits; badges are devnet collectibles. No real-money value.
//!
//! Pools: 0..7 EXTRACTS(slot) [0 YES, 1 NO]; 8..12 NEXT CRACK window 0..4 [TOWER, FACTORY, HARBOR, NONE];
//! 13..22 KNOCKOUT IN 30 S window 0..9 [YES, NO].
use crate::constants::*;
use crate::errors::RazkynError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{self, Mint, MintTo, TokenAccount, TokenInterface};
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::consts::MAGIC_PROGRAM_ID;
#[allow(deprecated)]
use ephemeral_rollups_sdk::crank::{ScheduleCrankCpi, ScheduleTaskArgs};
use ephemeral_rollups_sdk::ephem::{FoldableIntentBuilder, MagicIntentBundleBuilder};
use solana_sha256_hasher::hashv;

pub const PICKS_SEED: &[u8] = b"picks";
pub const BADGE_MINT_SEED: &[u8] = b"badge_mint";
pub const MAX_SPECTATORS: usize = 24;
pub const MAX_PICK_BETS: usize = 160;
pub const NUM_POOLS: usize = 23;
pub const START_CREDITS: u32 = 100;
pub const UNRESOLVED: u8 = 255;
pub const REFUNDED: u8 = 254;
/// Pick timing (seconds after raid start).
pub const EXTRACTS_LOCK_SECS: i64 = 270;
pub const CRACK_EVERY: i64 = 60;
pub const CRACK_LOCK: i64 = 10;
pub const CRACK_WATCH: i64 = 60;
pub const CRACK_WINDOWS: usize = 5;
pub const KO_EVERY: i64 = 30;
pub const KO_LOCK: i64 = 8;
pub const KO_WATCH: i64 = 30;
pub const KO_WINDOWS: usize = 10;
pub const RAID_SECS_I: i64 = 300;
pub const BADGE_STREAK: u8 = 3;
pub mod book_status {
    pub const OPEN: u8 = 0;
    pub const CLOSED: u8 = 1;
    pub const CANCELLED: u8 = 2;
}

/// 76 bytes, 4-aligned, no padding.
#[zero_copy]
#[repr(C)]
#[derive(Default)]
pub struct Spectator {
    pub wallet: Pubkey,
    /// Session key that signs picks for this wallet (scoped: it can only call place_pick on this book).
    pub session: Pubkey,
    pub credits: u32,
    pub picks: u8,
    pub correct: u8,
    pub streak: u8,
    pub best_streak: u8,
    /// 0 none; 1..=4 streak badge variant (from the raid's VRF seed).
    pub badge: u8,
    pub badge_claimed: u8,
    pub _pad: [u8; 2],
}

/// 6 bytes, 2-aligned, no padding.
#[zero_copy]
#[repr(C)]
#[derive(Default)]
pub struct PickBet {
    pub spec: u8,
    pub pool: u8,
    pub choice: u8,
    pub _pad: u8,
    pub amount: u16,
}

/// `["picks", raid_id]`, base → TEE (public). Zero-copy (too large for the 4 KB stack as Borsh).
/// Size: 8 + 3_208 bytes (< 10,240). Fields ordered by alignment so there is no implicit padding.
#[account(zero_copy)]
#[repr(C)]
pub struct PickBook {
    pub raid_id: u64,
    pub start_ts: i64,
    pub totals: [[u32; 4]; NUM_POOLS],
    pub spectators: [Spectator; MAX_SPECTATORS],
    pub bets: [PickBet; MAX_PICK_BETS],
    pub n_bets: u16,
    pub outcome: [u8; NUM_POOLS],
    /// Snapshot of public state at the previous resolve (to detect new cracks / knockouts).
    pub prev_hazard: [u8; 3],
    pub bump: u8,
    pub status: u8,
    pub n_spec: u8,
    pub prev_alive: u8,
    /// 1 once resolve_picks has taken its first public-state snapshot after the start.
    pub inited: u8,
    pub _pad: [u8; 7],
}

/// Pool timing: (open, lock, end) unix seconds. EXTRACTS opens when the book is live (before start).
pub fn pool_times(start: i64, pool: usize) -> (i64, i64, i64) {
    if pool < MAX_RAIDERS {
        return (i64::MIN, start + EXTRACTS_LOCK_SECS, start + RAID_SECS_I);
    }
    if pool < MAX_RAIDERS + CRACK_WINDOWS {
        let w = (pool - MAX_RAIDERS) as i64;
        let open = start + w * CRACK_EVERY;
        let lock = open + CRACK_LOCK;
        return (open, lock, (lock + CRACK_WATCH).min(start + RAID_SECS_I));
    }
    let w = (pool - MAX_RAIDERS - CRACK_WINDOWS) as i64;
    let open = start + w * KO_EVERY;
    let lock = open + KO_LOCK;
    (open, lock, (lock + KO_WATCH).min(start + RAID_SECS_I))
}
pub fn pool_choices(pool: usize) -> u8 {
    if pool >= MAX_RAIDERS && pool < MAX_RAIDERS + CRACK_WINDOWS { 4 } else { 2 }
}

impl PickBook {
    fn spec_by_session(&self, session: &Pubkey) -> Option<usize> {
        (0..self.n_spec as usize).find(|&i| self.spectators[i].session == *session)
    }
    /// Pay a resolved pool: parimutuel, integer remainder to the largest winning stake (earliest on ties),
    /// so payouts always sum to the pool. No winners → everyone refunded. Updates picks / streaks.
    fn settle_pool(&mut self, pool: usize, outcome: u8) -> Result<()> {
        if self.outcome[pool] != UNRESOLVED { return Ok(()); }
        self.outcome[pool] = outcome;
        let n = self.n_bets as usize;
        let mut total: u64 = 0;
        let mut wsum: u64 = 0;
        let mut top: Option<usize> = None;
        for i in 0..n {
            let b = self.bets[i];
            if b.pool as usize != pool { continue; }
            total = total.checked_add(b.amount as u64).ok_or(RazkynError::Overflow)?;
            if b.choice == outcome {
                wsum = wsum.checked_add(b.amount as u64).ok_or(RazkynError::Overflow)?;
                if top.map_or(true, |t| b.amount > self.bets[t].amount) { top = Some(i); }
            }
        }
        let mut paid: u64 = 0;
        for i in 0..n {
            let b = self.bets[i];
            if b.pool as usize != pool { continue; }
            let s = &mut self.spectators[b.spec as usize];
            s.picks = s.picks.saturating_add(1);
            if outcome == REFUNDED || wsum == 0 {
                // Refund (cancelled raid, empty seat, or nobody on the winning side).
                s.credits = s.credits.checked_add(b.amount as u32).ok_or(RazkynError::Overflow)?;
                if outcome != REFUNDED { s.streak = 0; }
                continue;
            }
            if b.choice == outcome {
                let share = (b.amount as u64).checked_mul(total).ok_or(RazkynError::Overflow)? / wsum;
                paid += share;
                s.credits = s.credits.checked_add(share as u32).ok_or(RazkynError::Overflow)?;
                s.correct = s.correct.saturating_add(1);
                s.streak = s.streak.saturating_add(1);
                s.best_streak = s.best_streak.max(s.streak);
            } else {
                s.streak = 0;
            }
        }
        if wsum > 0 && outcome != REFUNDED {
            let rest = total.checked_sub(paid).ok_or(RazkynError::Conservation)?;
            if let Some(t) = top {
                let spec = self.bets[t].spec as usize;
                self.spectators[spec].credits = self.spectators[spec].credits.checked_add(rest as u32).ok_or(RazkynError::Overflow)?;
            }
        }
        Ok(())
    }
    pub fn all_resolved(&self) -> bool { self.outcome.iter().all(|&o| o != UNRESOLVED) }
}

// ======================= create_pick_book (base, keeper) =======================
#[derive(Accounts)]
#[instruction(raid_id: u64)]
pub struct CreatePickBook<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = keeper @ RazkynError::Unauthorized)]
    pub config: Box<Account<'info, Config>>,
    #[account(seeds = [RAID_SEED, &raid_id.to_le_bytes()], bump = raid.bump)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(init, payer = keeper, space = 8 + std::mem::size_of::<PickBook>(), seeds = [PICKS_SEED, &raid_id.to_le_bytes()], bump)]
    pub book: AccountLoader<'info, PickBook>,
    #[account(mut)]
    pub keeper: Signer<'info>,
    pub system_program: Program<'info, System>,
}
pub fn create_pick_book(ctx: Context<CreatePickBook>, raid_id: u64) -> Result<()> {
    require!(ctx.accounts.raid.status == status::LOBBY, RazkynError::BadStatus);
    let mut b = ctx.accounts.book.load_init()?;
    b.raid_id = raid_id;
    b.bump = ctx.bumps.book;
    b.status = book_status::OPEN;
    b.outcome = [UNRESOLVED; NUM_POOLS];
    Ok(())
}

// ======================= register_spectator (TEE, wallet) =======================
#[derive(Accounts)]
pub struct RegisterSpectator<'info> {
    #[account(mut, seeds = [PICKS_SEED, &raid.raid_id.to_le_bytes()], bump)]
    pub book: AccountLoader<'info, PickBook>,
    #[account(seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump)]
    pub raid: Box<Account<'info, Raid>>,
    pub wallet: Signer<'info>,
}
pub fn register_spectator(ctx: Context<RegisterSpectator>, session: Pubkey) -> Result<()> {
    let mut b = ctx.accounts.book.load_mut()?;
    require!(b.status == book_status::OPEN, RazkynError::PicksClosed);
    let w = ctx.accounts.wallet.key();
    if let Some(i) = (0..b.n_spec as usize).find(|&i| b.spectators[i].wallet == w) {
        b.spectators[i].session = session; // rotate the session key, keep credits and stats
        return Ok(());
    }
    require!((b.n_spec as usize) < MAX_SPECTATORS, RazkynError::BookFull);
    require!(b.spec_by_session(&session).is_none(), RazkynError::BadAccount);
    let i = b.n_spec as usize;
    b.spectators[i] = Spectator { wallet: w, session, credits: START_CREDITS, ..Default::default() };
    b.n_spec += 1;
    Ok(())
}

// ======================= place_pick (TEE, session key) =======================
#[derive(Accounts)]
pub struct PlacePick<'info> {
    #[account(mut, seeds = [PICKS_SEED, &raid.raid_id.to_le_bytes()], bump)]
    pub book: AccountLoader<'info, PickBook>,
    #[account(seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump)]
    pub raid: Box<Account<'info, Raid>>,
    pub session: Signer<'info>,
}
pub fn place_pick(ctx: Context<PlacePick>, pool: u8, choice: u8, amount: u16) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let raid = &ctx.accounts.raid;
    let mut b = ctx.accounts.book.load_mut()?;
    require!(b.status == book_status::OPEN && raid.status <= status::LIVE, RazkynError::PicksClosed);
    let p = pool as usize;
    require!(p < NUM_POOLS && choice < pool_choices(p) && amount > 0, RazkynError::BadPick);
    if p < MAX_RAIDERS { require!(raid.raiders[p].joined || raid.status < status::LIVE, RazkynError::BadPick); }
    // Program clock (TEE), never the client's: picks other than EXTRACTS need the raid to have started.
    let start = raid.start_ts;
    if p >= MAX_RAIDERS { require!(raid.status == status::LIVE, RazkynError::PicksClosed); }
    if raid.status >= status::LIVE {
        let (open, lock, _) = pool_times(start, p);
        require!(now >= open && now < lock, RazkynError::PicksClosed);
    }
    require!(b.outcome[p] == UNRESOLVED, RazkynError::PicksClosed);
    let s = b.spec_by_session(&ctx.accounts.session.key()).ok_or(RazkynError::NotSpectator)?;
    // One choice per spectator per pool.
    let n = b.n_bets as usize;
    require!(!(0..n).any(|i| b.bets[i].spec as usize == s && b.bets[i].pool == pool), RazkynError::AlreadyPicked);
    require!(n < MAX_PICK_BETS, RazkynError::BookFull);
    require!(b.spectators[s].credits >= amount as u32, RazkynError::NoCredits);
    b.spectators[s].credits -= amount as u32;
    b.totals[p][choice as usize] = b.totals[p][choice as usize].checked_add(amount as u32).ok_or(RazkynError::Overflow)?;
    b.bets[n] = PickBet { spec: s as u8, pool, choice, _pad: 0, amount };
    b.n_bets += 1;
    Ok(())
}

// ======================= resolve_picks (TEE, anyone / crank) =======================
/// Reads ONLY public accounts: Raid, District ×3 and RaiderPublic ×8 (no RaiderPrivate, View, Crate or RaidSecret).
#[derive(Accounts)]
pub struct ResolvePicks<'info> {
    #[account(mut, seeds = [PICKS_SEED, &raid.raid_id.to_le_bytes()], bump)]
    pub book: AccountLoader<'info, PickBook>,
    #[account(seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(seeds = [DISTRICT_SEED, &raid.raid_id.to_le_bytes(), &[0]], bump = district0.bump)]
    pub district0: Box<Account<'info, District>>,
    #[account(seeds = [DISTRICT_SEED, &raid.raid_id.to_le_bytes(), &[1]], bump = district1.bump)]
    pub district1: Box<Account<'info, District>>,
    #[account(seeds = [DISTRICT_SEED, &raid.raid_id.to_le_bytes(), &[2]], bump = district2.bump)]
    pub district2: Box<Account<'info, District>>,
    #[account(seeds = [RPUB_SEED, &raid.raid_id.to_le_bytes(), &[0]], bump = rpub0.bump)]
    pub rpub0: Box<Account<'info, RaiderPublic>>,
    #[account(seeds = [RPUB_SEED, &raid.raid_id.to_le_bytes(), &[1]], bump = rpub1.bump)]
    pub rpub1: Box<Account<'info, RaiderPublic>>,
    #[account(seeds = [RPUB_SEED, &raid.raid_id.to_le_bytes(), &[2]], bump = rpub2.bump)]
    pub rpub2: Box<Account<'info, RaiderPublic>>,
    #[account(seeds = [RPUB_SEED, &raid.raid_id.to_le_bytes(), &[3]], bump = rpub3.bump)]
    pub rpub3: Box<Account<'info, RaiderPublic>>,
    #[account(seeds = [RPUB_SEED, &raid.raid_id.to_le_bytes(), &[4]], bump = rpub4.bump)]
    pub rpub4: Box<Account<'info, RaiderPublic>>,
    #[account(seeds = [RPUB_SEED, &raid.raid_id.to_le_bytes(), &[5]], bump = rpub5.bump)]
    pub rpub5: Box<Account<'info, RaiderPublic>>,
    #[account(seeds = [RPUB_SEED, &raid.raid_id.to_le_bytes(), &[6]], bump = rpub6.bump)]
    pub rpub6: Box<Account<'info, RaiderPublic>>,
    #[account(seeds = [RPUB_SEED, &raid.raid_id.to_le_bytes(), &[7]], bump = rpub7.bump)]
    pub rpub7: Box<Account<'info, RaiderPublic>>,
}
pub fn resolve_picks(ctx: Context<ResolvePicks>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let a = &ctx.accounts;
    let raid = &a.raid;
    if raid.status < status::LIVE { return Ok(()); }
    let hz = [a.district0.hazard_level, a.district1.hazard_level, a.district2.hazard_level];
    let rp = [&a.rpub0, &a.rpub1, &a.rpub2, &a.rpub3, &a.rpub4, &a.rpub5, &a.rpub6, &a.rpub7];
    let mut alive: u8 = 0;
    let mut done = true; // every joined raider extracted or down
    for s in 0..MAX_RAIDERS {
        if !raid.raiders[s].joined { continue; }
        if rp[s].alive { alive |= 1 << s; }
        if rp[s].alive && !rp[s].extracted { done = false; }
    }
    let ended = raid.status >= status::ENDED || done || now >= raid.start_ts + RAID_SECS_I;
    let extracted: Vec<bool> = (0..MAX_RAIDERS).map(|s| rp[s].extracted).collect();
    let joined: Vec<bool> = (0..MAX_RAIDERS).map(|s| raid.raiders[s].joined).collect();
    let start = raid.start_ts;
    let mut b = ctx.accounts.book.load_mut()?;
    if b.status != book_status::OPEN { return Ok(()); }
    if b.inited == 0 {
        // First resolve after the start: snapshot public state; events are changes from here on.
        b.inited = 1;
        b.start_ts = start;
        b.prev_hazard = hz;
        b.prev_alive = alive;
        return Ok(());
    }
    // New public events since the previous resolve.
    let crack = (0..3).find(|&d| hz[d] > b.prev_hazard[d]);
    let death = b.prev_alive & !alive != 0;
    b.prev_hazard = [hz[0].max(b.prev_hazard[0]), hz[1].max(b.prev_hazard[1]), hz[2].max(b.prev_hazard[2])];
    b.prev_alive = alive;
    for w in 0..CRACK_WINDOWS {
        let pool = MAX_RAIDERS + w;
        if b.outcome[pool] != UNRESOLVED { continue; }
        let (_, lock, end) = pool_times(start, pool);
        if let Some(d) = crack { if now >= lock && now < end { b.settle_pool(pool, d as u8)?; continue; } }
        if now >= end || ended { b.settle_pool(pool, 3)?; } // NONE
    }
    for w in 0..KO_WINDOWS {
        let pool = MAX_RAIDERS + CRACK_WINDOWS + w;
        if b.outcome[pool] != UNRESOLVED { continue; }
        let (_, lock, end) = pool_times(start, pool);
        if death && now >= lock && now < end { b.settle_pool(pool, 0)?; continue; } // YES
        if now >= end || ended { b.settle_pool(pool, 1)?; } // NO
    }
    if ended {
        for s in 0..MAX_RAIDERS {
            if b.outcome[s] != UNRESOLVED { continue; }
            if joined[s] { b.settle_pool(s, if extracted[s] { 0 } else { 1 })?; } else { b.settle_pool(s, REFUNDED)?; }
        }
    }
    Ok(())
}

// ======================= schedule_pick_crank (TEE, payer) =======================
#[derive(Accounts)]
pub struct SchedulePickCrank<'info> {
    /// CHECK: Magic program, used for CPI.
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: owner checked; the scheduled resolve_picks re-validates every account by seeds.
    #[account(mut, owner = crate::ID)]
    pub book: UncheckedAccount<'info>,
    /// CHECK: forwarded to the scheduled instruction (validated there).
    pub raid: UncheckedAccount<'info>,
    /// CHECK: forwarded.
    pub district0: UncheckedAccount<'info>,
    /// CHECK: forwarded.
    pub district1: UncheckedAccount<'info>,
    /// CHECK: forwarded.
    pub district2: UncheckedAccount<'info>,
    /// CHECK: forwarded (RaiderPublic 0..7 as remaining accounts would hide them from the IDL; listed explicitly).
    pub rpub0: UncheckedAccount<'info>,
    /// CHECK: forwarded.
    pub rpub1: UncheckedAccount<'info>,
    /// CHECK: forwarded.
    pub rpub2: UncheckedAccount<'info>,
    /// CHECK: forwarded.
    pub rpub3: UncheckedAccount<'info>,
    /// CHECK: forwarded.
    pub rpub4: UncheckedAccount<'info>,
    /// CHECK: forwarded.
    pub rpub5: UncheckedAccount<'info>,
    /// CHECK: forwarded.
    pub rpub6: UncheckedAccount<'info>,
    /// CHECK: forwarded.
    pub rpub7: UncheckedAccount<'info>,
}
#[allow(deprecated)]
pub fn schedule_pick_crank<'info>(ctx: Context<'info, SchedulePickCrank<'info>>, task_id: i64, interval_ms: i64, iterations: i64) -> Result<()> {
    let a = ctx.accounts; // moved, so references below live for 'info (ScheduleCrankCpi needs &'info)
    {
        let data = a.book.try_borrow_data()?;
        require!(data.len() >= 8 && data[..8] == *PickBook::DISCRIMINATOR, RazkynError::BadAccount); // must be a PickBook
    }
    let list = [
        &a.book, &a.raid, &a.district0, &a.district1, &a.district2,
        &a.rpub0, &a.rpub1, &a.rpub2, &a.rpub3, &a.rpub4, &a.rpub5, &a.rpub6, &a.rpub7,
    ];
    let crank_ix = Instruction {
        program_id: crate::ID,
        accounts: list.iter().enumerate().map(|(i, x)| if i == 0 { AccountMeta::new(x.key(), false) } else { AccountMeta::new_readonly(x.key(), false) }).collect(),
        data: anchor_lang::InstructionData::data(&crate::instruction::ResolvePicks {}),
    };
    let mut accounts = vec![a.payer.to_account_info()];
    accounts.extend(list.iter().map(|x| x.to_account_info()));
    ScheduleCrankCpi {
        payer: &a.payer,
        magic_program: &&a.magic_program,
        instruction_accounts: &accounts,
        args: ScheduleTaskArgs { task_id, execution_interval_millis: interval_ms, iterations, instructions: vec![crank_ix] },
    }
    .invoke()?;
    Ok(())
}

// ======================= cancel_picks (TEE, keeper) =======================
#[derive(Accounts)]
pub struct CancelPicks<'info> {
    #[account(mut, seeds = [PICKS_SEED, &raid.raid_id.to_le_bytes()], bump)]
    pub book: AccountLoader<'info, PickBook>,
    #[account(seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump, has_one = keeper @ RazkynError::Unauthorized)]
    pub raid: Box<Account<'info, Raid>>,
    pub keeper: Signer<'info>,
}
/// A cancelled or failed raid: every pool that has not resolved is refunded in full.
pub fn cancel_picks(ctx: Context<CancelPicks>) -> Result<()> {
    let mut b = ctx.accounts.book.load_mut()?;
    require!(b.status == book_status::OPEN, RazkynError::PicksClosed);
    for p in 0..NUM_POOLS { if b.outcome[p] == UNRESOLVED { b.settle_pool(p, REFUNDED)?; } }
    b.status = book_status::CANCELLED;
    Ok(())
}

// ======================= close_picks (TEE, anyone) =======================
#[commit]
#[derive(Accounts)]
#[instruction(raid_id: u64)]
pub struct ClosePicks<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [PICKS_SEED, &raid_id.to_le_bytes()], bump)]
    pub book: AccountLoader<'info, PickBook>,
    /// Read only for the VRF seed (badge variants), after every pick has resolved.
    #[account(seeds = [SECRET_SEED, &raid_id.to_le_bytes()], bump)]
    pub secret: AccountLoader<'info, RaidSecret>,
}
pub fn close_picks<'info>(ctx: Context<'info, ClosePicks<'info>>, _raid_id: u64) -> Result<()> {
    {
        let seed = ctx.accounts.secret.load()?.seed;
        let mut b = ctx.accounts.book.load_mut()?;
        require!(b.status != book_status::OPEN || b.all_resolved(), RazkynError::PicksOpen);
        if b.status == book_status::OPEN {
            let n = b.n_spec as usize;
            for i in 0..n {
                let s = &mut b.spectators[i];
                if s.best_streak >= BADGE_STREAK && s.badge == 0 {
                    let h = hashv(&[&seed, b"streak", s.wallet.as_ref()]).to_bytes();
                    s.badge = h[0] % 4 + 1;
                }
            }
            b.status = book_status::CLOSED;
        }
    }
    MagicIntentBundleBuilder::new(
        ctx.accounts.payer.to_account_info(),
        ctx.accounts.magic_context.to_account_info(),
        ctx.accounts.magic_program.to_account_info(),
    )
    .commit_and_undelegate(&[ctx.accounts.book.to_account_info()])
    .build_and_invoke()?;
    Ok(())
}

// ======================= init_badge_mint (base, keeper) / claim_badge (base, anyone) =======================
#[derive(Accounts)]
pub struct InitBadgeMint<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = keeper @ RazkynError::Unauthorized)]
    pub config: Box<Account<'info, Config>>,
    /// CHECK: mint authority PDA.
    #[account(seeds = [MINT_AUTH_SEED], bump = config.mint_auth_bump)]
    pub mint_auth: UncheckedAccount<'info>,
    #[account(init, payer = keeper, seeds = [BADGE_MINT_SEED], bump, mint::decimals = 0, mint::authority = mint_auth, mint::token_program = token_program)]
    pub badge_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub keeper: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}
pub fn init_badge_mint(_ctx: Context<InitBadgeMint>) -> Result<()> { Ok(()) }

#[derive(Accounts)]
#[instruction(raid_id: u64, spec: u8)]
pub struct ClaimBadge<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [PICKS_SEED, &raid_id.to_le_bytes()], bump)]
    pub book: AccountLoader<'info, PickBook>,
    /// CHECK: mint authority PDA.
    #[account(seeds = [MINT_AUTH_SEED], bump = config.mint_auth_bump)]
    pub mint_auth: UncheckedAccount<'info>,
    #[account(mut, seeds = [BADGE_MINT_SEED], bump, mint::token_program = token_program)]
    pub badge_mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: must equal the spectator's wallet (checked in the handler).
    pub wallet: UncheckedAccount<'info>,
    #[account(init_if_needed, payer = payer, associated_token::mint = badge_mint, associated_token::authority = wallet, associated_token::token_program = token_program)]
    pub wallet_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
/// Base layer, after close_picks committed the book: mint 1 badge to a streak winner. Pays once.
pub fn claim_badge(ctx: Context<ClaimBadge>, _raid_id: u64, spec: u8) -> Result<()> {
    {
    let mut b = ctx.accounts.book.load_mut()?;
    let i = spec as usize;
    require!(b.status == book_status::CLOSED && i < b.n_spec as usize, RazkynError::NoBadge);
    require_keys_eq!(b.spectators[i].wallet, ctx.accounts.wallet.key(), RazkynError::BadAccount);
    require!(b.spectators[i].badge > 0, RazkynError::NoBadge);
    require!(b.spectators[i].badge_claimed == 0, RazkynError::AlreadyClaimed);
    b.spectators[i].badge_claimed = 1;
    }
    let seeds: &[&[u8]] = &[MINT_AUTH_SEED, &[ctx.accounts.config.mint_auth_bump]];
    token_interface::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            MintTo { mint: ctx.accounts.badge_mint.to_account_info(), to: ctx.accounts.wallet_ata.to_account_info(), authority: ctx.accounts.mint_auth.to_account_info() },
            &[seeds],
        ),
        1,
    )?;
    Ok(())
}
