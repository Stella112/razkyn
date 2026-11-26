//! TEE gameplay for M1: move_to (raid key), tick + tick_raiders (permissionless, clock-gated).
//! `tick` is split in two (raid clock/exits, then per-raider fog) so each transaction stays
//! inside the account and size limits; see DECISIONS.md.
use crate::constants::*;
use crate::errors::RazkynError;
use crate::state::*;
use crate::util::*;
use anchor_lang::prelude::*;

/// Shared gameplay gate (CLAUDE.md §6.6): signer is the slot's raid key, raid is Live and not
/// over, raider alive and not extracted.
pub fn require_can_act(raid: &Raid, slot: u8, signer: &Pubkey, now_ts: i64) -> Result<()> {
    require!(raid.status == status::LIVE, RazkynError::BadStatus);
    require!(now_ts < raid.end_ts, RazkynError::RaidOver);
    require!((slot as usize) < MAX_RAIDERS, RazkynError::BadSlot);
    let r = &raid.raiders[slot as usize];
    require!(r.joined, RazkynError::SlotNotJoined);
    require_keys_eq!(r.raid_key, *signer, RazkynError::WrongRaidKey);
    require!(r.alive, RazkynError::RaiderDead);
    require!(!r.extracted, RazkynError::RaiderExtracted);
    Ok(())
}

// ---------------- move_to ----------------

#[derive(Accounts)]
#[instruction(slot: u8)]
pub struct MoveTo<'info> {
    #[account(seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(mut, seeds = [RPRV_SEED, &raid.raid_id.to_le_bytes(), &[slot]], bump = rprv.bump)]
    pub rprv: Account<'info, RaiderPrivate>,
    pub raid_key: Signer<'info>,
}

/// Move by (dx, dy) units. Speed is validated against elapsed ER slots since the last move:
/// budget = min(elapsed_slots × 6, 60) units (6 tiles/s), Euclidean. Larger jumps are rejected.
pub fn move_to(ctx: Context<MoveTo>, slot: u8, dx: i16, dy: i16) -> Result<()> {
    let clock = Clock::get()?;
    let raid = &ctx.accounts.raid;
    require_can_act(raid, slot, &ctx.accounts.raid_key.key(), clock.unix_timestamp)?;
    let p = &mut ctx.accounts.rprv;
    // Trading means standing at the terminal (CLAUDE.md §2: "trade under fire").
    require!(p.channel_kind != CH_TRADE, RazkynError::Trading);
    let since = p.last_move_slot.max(raid.start_slot);
    let elapsed = clock.slot.saturating_sub(since);
    let budget = elapsed
        .checked_mul(SPEED_UNITS_PER_SLOT)
        .ok_or(RazkynError::Overflow)?
        .min(MAX_STEP_UNITS);
    let ddx = (dx as i64).unsigned_abs();
    let ddy = (dy as i64).unsigned_abs();
    let d2 = ddx * ddx + ddy * ddy;
    require!(d2 <= budget * budget, RazkynError::TooFast);
    let nx = (p.x as i64).checked_add(dx as i64).ok_or(RazkynError::Overflow)?;
    let ny = (p.y as i64).checked_add(dy as i64).ok_or(RazkynError::Overflow)?;
    require!(
        (0..=MAX_X as i64).contains(&nx) && (0..=MAX_Y as i64).contains(&ny),
        RazkynError::OutOfBounds
    );
    p.x = nx as u16;
    p.y = ny as u16;
    p.last_move_slot = clock.slot;
    Ok(())
}

// ---------------- tick ----------------

#[derive(Accounts)]
pub struct Tick<'info> {
    #[account(mut, seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(seeds = [SECRET_SEED, &raid.raid_id.to_le_bytes()], bump)]
    pub secret: AccountLoader<'info, RaidSecret>,
    #[account(mut, seeds = [DISTRICT_SEED, &raid.raid_id.to_le_bytes(), &[0]], bump = district0.bump)]
    pub district0: Box<Account<'info, District>>,
    #[account(mut, seeds = [DISTRICT_SEED, &raid.raid_id.to_le_bytes(), &[1]], bump = district1.bump)]
    pub district1: Box<Account<'info, District>>,
    #[account(mut, seeds = [DISTRICT_SEED, &raid.raid_id.to_le_bytes(), &[2]], bump = district2.bump)]
    pub district2: Box<Account<'info, District>>,
    /// CHECK: Live mode only: Pricing Oracle feed for district 0 (validated in read_feed).
    pub feed0: Option<UncheckedAccount<'info>>,
    /// CHECK: Live mode only: feed for district 1.
    pub feed1: Option<UncheckedAccount<'info>>,
    /// CHECK: Live mode only: feed for district 2.
    pub feed2: Option<UncheckedAccount<'info>>,
}

/// Permissionless. Advances at most once per TICK_SLOTS; an early call is a no-op so the
/// keeper (or anyone) can call it at a fixed cadence. Each tick: exit windows, district
/// wake/hazard levels from prices, raid end at 300 s. Market steps are applied in M3;
/// settlement is M4.
pub fn tick(ctx: Context<Tick>) -> Result<()> {
    let clock = Clock::get()?;
    let raid = &mut ctx.accounts.raid;
    if raid.status != status::LIVE {
        return Ok(());
    }
    if clock.slot < raid.last_tick_slot.saturating_add(TICK_SLOTS) {
        return Ok(());
    }
    raid.tick_no = raid.tick_no.checked_add(1).ok_or(RazkynError::Overflow)?;
    raid.prev_tick_slot = raid.last_tick_slot;
    raid.last_tick_slot = clock.slot;
    let elapsed = clock.unix_timestamp.saturating_sub(raid.start_ts).max(0);

    // Market: one step per second boundary (300 steps). Prices are an index ×10^4,
    // 100.0000 at raid start. Mystery: the verified slice. Live: validated oracle feeds;
    // a stale or invalid feed leaves that district's price unchanged this step.
    let step = elapsed.min(SLICE_STEPS as i64 - 1) as u16;
    if ctx.accounts.district0.hist_len == 0 || step != raid.market_step {
        let mode = raid.mode;
        let feeds = [&ctx.accounts.feed0, &ctx.accounts.feed1, &ctx.accounts.feed2];
        let ds = [&mut ctx.accounts.district0, &mut ctx.accounts.district1, &mut ctx.accounts.district2];
        if mode == crate::state::mode::MYSTERY {
            let s = ctx.accounts.secret.load()?;
            for (i, d) in ds.into_iter().enumerate() {
                let index = s.slice[step as usize * NUM_ASSETS + i] as u64;
                crate::instructions::market::push_price(d, index);
            }
        } else {
            let feed_set = if mode == crate::state::mode::LIVE_MARKETS { &LIVE_MARKET_FEEDS } else { &LIVE_FEEDS };
            for (i, d) in ds.into_iter().enumerate() {
                let raw = feeds[i]
                    .as_ref()
                    .and_then(|f| crate::instructions::market::read_feed(&f.to_account_info(), &feed_set[i], clock.unix_timestamp));
                match raw {
                    Some(raw) => {
                        if d.start_raw == 0 {
                            d.start_raw = raw;
                        }
                        let index = (PRICE_ONE as u128 * raw as u128 / d.start_raw as u128).min(u64::MAX as u128) as u64;
                        crate::instructions::market::push_price(d, index);
                    }
                    None => msg!("feed {} stale or invalid: price held", i),
                }
            }
        }
        raid.market_step = step;
    }

    // Market events (v2): end the active one when its time is up; fire planned ones whose second
    // has come (the plan is private in RaidSecret; its hash was committed at the VRF callback).
    if raid.event_kind != EVENT_NONE && clock.unix_timestamp >= raid.event_until {
        raid.event_kind = EVENT_NONE;
    }
    let mut earnings: Option<u8> = None;
    {
        let s = ctx.accounts.secret.load()?;
        for i in 0..NUM_EVENTS {
            let kind = s.events[4 * i];
            let at = u16::from_le_bytes([s.events[4 * i + 2], s.events[4 * i + 3]]) as i64;
            if kind != EVENT_NONE && raid.events_fired & (1 << i) == 0 && elapsed >= at {
                raid.events_fired |= 1 << i;
                raid.event_kind = kind;
                raid.event_district = s.events[4 * i + 1];
                raid.event_until = clock.unix_timestamp + EVENT_SECS;
                if kind == EVENT_EARNINGS {
                    earnings = Some(raid.event_district);
                }
                msg!("market event {} district {} at {}s", kind, raid.event_district, elapsed);
            }
        }
    }
    let shock = raid.event_kind == EVENT_RATE_SHOCK && clock.unix_timestamp < raid.event_until;
    let (h1, h2) = if shock { (SHOCK_HAZARD1_BPS, SHOCK_HAZARD2_BPS) } else { (HAZARD1_BPS, HAZARD2_BPS) };

    // The market moves the map: ≥ +2% wakes dormant crates; ≤ −2% / ≤ −5% hazard levels
    // (≤ −1% / ≤ −3% during a RATE SHOCK). EARNINGS SURPRISE unlocks a district's dormant crates.
    for (i, d) in [&mut ctx.accounts.district0, &mut ctx.accounts.district1, &mut ctx.accounts.district2].into_iter().enumerate() {
        let bps = change_bps(d.start_price, d.current_price);
        if (bps >= WAKE_BPS || earnings == Some(i as u8)) && !d.awake {
            d.awake = true;
            d.awake_mask = (1 << (CRATES_PER_DISTRICT - ACTIVE_PER_DISTRICT)) - 1;
        }
        d.hazard_level = if bps <= h2 { 2 } else if bps <= h1 { 1 } else { 0 };
    }

    // Exit windows: copy the VRF-chosen pair from the private plan only while it is open.
    let mut window = 0u8;
    for (w, start) in EXIT_WINDOW_STARTS.iter().enumerate() {
        if elapsed >= *start && elapsed < start + EXIT_WINDOW_SECS {
            window = w as u8 + 1;
        }
    }
    if window != raid.exit_window {
        raid.exit_window = window;
        raid.open_exits = if window == 0 {
            [NO_EXIT; EXITS_PER_WINDOW]
        } else {
            let s = ctx.accounts.secret.load()?;
            let w = (window - 1) as usize;
            [s.exit_plan[2 * w], s.exit_plan[2 * w + 1]]
        };
    }
    if elapsed >= RAID_SECS {
        raid.status = status::ENDED;
    }
    Ok(())
}

// ---------------- tick_raiders (hazards + fog) ----------------

#[derive(Accounts)]
pub struct TickRaiders<'info> {
    #[account(mut, seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(seeds = [DISTRICT_SEED, &raid.raid_id.to_le_bytes(), &[0]], bump = district0.bump)]
    pub district0: Box<Account<'info, District>>,
    #[account(seeds = [DISTRICT_SEED, &raid.raid_id.to_le_bytes(), &[1]], bump = district1.bump)]
    pub district1: Box<Account<'info, District>>,
    #[account(seeds = [DISTRICT_SEED, &raid.raid_id.to_le_bytes(), &[2]], bump = district2.bump)]
    pub district2: Box<Account<'info, District>>,
    // remaining_accounts: for each joined slot in slot order:
    //   RaiderPrivate (read), View (write), RaiderPublic (write).
}

/// Permissionless, once per tick (View.tick_no). Hazard damage first (10 HP/s on an active
/// hazard tile; a hazard death sets pending_drop for drop_backpack), then fog: every View
/// lists the other living, non-extracted raiders within 8 tiles.
pub fn tick_raiders<'info>(ctx: Context<'info, TickRaiders<'info>>) -> Result<()> {
    if ctx.accounts.raid.status != status::LIVE {
        return Ok(());
    }
    let levels = [
        ctx.accounts.district0.hazard_level,
        ctx.accounts.district1.hazard_level,
        ctx.accounts.district2.hazard_level,
    ];
    let raid = &mut ctx.accounts.raid;
    let id = raid.raid_id.to_le_bytes();
    let tick_no = raid.tick_no;
    let gap = raid.last_tick_slot.saturating_sub(raid.prev_tick_slot).min(HAZARD_MAX_SLOTS_PER_TICK);
    let dmg = (gap * HAZARD_HP_PER_100_SLOTS / 100).min(u8::MAX as u64) as u8;

    let mut pos: [(bool, u16, u16); MAX_RAIDERS] = [(false, 0, 0); MAX_RAIDERS];
    let mut slots: Vec<(usize, View)> = Vec::with_capacity(MAX_RAIDERS);
    for i in 0..MAX_RAIDERS {
        if !raid.raiders[i].joined {
            continue;
        }
        let n = slots.len();
        let pinfo = ctx.remaining_accounts.get(3 * n).ok_or(RazkynError::BadAccount)?;
        let vinfo = ctx.remaining_accounts.get(3 * n + 1).ok_or(RazkynError::BadAccount)?;
        let uinfo = ctx.remaining_accounts.get(3 * n + 2).ok_or(RazkynError::BadAccount)?;
        let p: RaiderPrivate = load(pinfo)?;
        check_pda(pinfo, &[RPRV_SEED, &id, &[i as u8]], p.bump)?;
        let v: View = load(vinfo)?;
        check_pda(vinfo, &[VIEW_SEED, &id, &[i as u8]], v.bump)?;
        let fresh = !(v.tick_no == tick_no && tick_no != 0);
        let r = raid.raiders[i];
        if fresh && r.alive && !r.extracted && dmg > 0 {
            if let Some(d) = district_of(p.x) {
                if in_hazard(p.y, levels[d]) {
                    let mut u: RaiderPublic = load(uinfo)?;
                    check_pda(uinfo, &[RPUB_SEED, &id, &[i as u8]], u.bump)?;
                    u.hp = u.hp.saturating_sub(dmg);
                    if u.hp == 0 {
                        raid.raiders[i].alive = false;
                        u.alive = false;
                        u.exposed = true;
                        u.pub_x = p.x;
                        u.pub_y = p.y;
                        u.pending_drop = true;
                    }
                    store(uinfo, &u)?;
                }
            }
        }
        let r = raid.raiders[i];
        pos[i] = (r.alive && !r.extracted, p.x, p.y);
        slots.push((i, v));
    }
    let all: Vec<usize> = slots.iter().map(|(i, _)| *i).collect();
    let classes = raid.classes;
    for (n, (i, v)) in slots.iter_mut().enumerate() {
        if v.tick_no == tick_no && tick_no != 0 {
            continue;
        }
        v.tick_no = tick_no;
        v.count = 0;
        v.entries = [ViewEntry::default(); VIEW_ENTRIES];
        // Scouts see 10 tiles, everyone else 8.
        let vis = if classes[*i] == CLASS_SCOUT { SCOUT_VISION_UNITS } else { VISION_UNITS };
        let v2 = vis * vis;
        if pos[*i].0 {
            for &j in all.iter() {
                if j == *i || !pos[j].0 {
                    continue;
                }
                if dist2(pos[*i].1, pos[*i].2, pos[j].1, pos[j].2) <= v2 {
                    v.entries[v.count as usize] = ViewEntry { slot: j as u8, x: pos[j].1, y: pos[j].2 };
                    v.count += 1;
                }
            }
        }
        store(&ctx.remaining_accounts[3 * n + 1], v)?;
    }
    Ok(())
}
