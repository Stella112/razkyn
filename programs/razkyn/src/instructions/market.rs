//! M3: Mystery slice integrity (load_slice, verify_slice), market steps (Mystery slice or Live
//! oracle), and trades with exposure (start_trade, finish_trade, cancel_trade).
use crate::constants::*;
use crate::errors::RazkynError;
use crate::instructions::play::require_can_act;
use crate::state::*;
use crate::util::*;
use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;
use solana_sha256_hasher::hashv;

// ---------------- load_slice / verify_slice (TEE, keeper, Mystery) ----------------

#[derive(Accounts)]
pub struct LoadSlice<'info> {
    #[account(seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump, has_one = keeper @ RazkynError::Unauthorized)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(mut, seeds = [SECRET_SEED, &raid.raid_id.to_le_bytes()], bump)]
    pub secret: AccountLoader<'info, RaidSecret>,
    pub keeper: Signer<'info>,
}

/// Write one 720-byte chunk of the chosen day's slice into RaidSecret (on the TEE, after the
/// secret's keeper-only permission exists and the VRF has picked the leaf).
pub fn load_slice(ctx: Context<LoadSlice>, chunk: u8, bytes: Vec<u8>) -> Result<()> {
    let raid = &ctx.accounts.raid;
    require!(raid.mode == mode::MYSTERY, RazkynError::BadMode);
    require!(raid.status == status::SEEDED, RazkynError::NotSeeded);
    require!((chunk as u32) < SLICE_CHUNKS && bytes.len() == SLICE_CHUNK, RazkynError::BadChunk);
    let mut s = ctx.accounts.secret.load_mut()?;
    require!(s.verified == 0, RazkynError::BadStatus);
    let dst: &mut [u8] = bytemuck::cast_slice_mut(&mut s.slice);
    let off = chunk as usize * SLICE_CHUNK;
    dst[off..off + SLICE_CHUNK].copy_from_slice(&bytes);
    s.loaded_chunks |= 1 << chunk;
    Ok(())
}

#[derive(Accounts)]
pub struct VerifySlice<'info> {
    #[account(seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump, has_one = keeper @ RazkynError::Unauthorized)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(mut, seeds = [SECRET_SEED, &raid.raid_id.to_le_bytes()], bump)]
    pub secret: AccountLoader<'info, RaidSecret>,
    pub keeper: Signer<'info>,
}

/// Leaf = sha256(day_id ‖ slice_start (u32 LE) ‖ data_hash ‖ headlines_hash) (CLAUDE.md §6.4).
pub fn mystery_leaf(day_id: &[u8; DAY_ID_LEN], slice_start: u32, data_hash: &[u8; 32], headlines_hash: &[u8; 32]) -> [u8; 32] {
    hashv(&[day_id.as_ref(), slice_start.to_le_bytes().as_ref(), data_hash.as_ref(), headlines_hash.as_ref()]).to_bytes()
}

/// Walk a Merkle proof: at level k, bit k of `index` = 1 means the current node is the right
/// child. Parent = sha256(left ‖ right).
pub fn merkle_root(leaf: [u8; 32], index: u32, proof: &[[u8; 32]]) -> [u8; 32] {
    let mut node = leaf;
    for (k, sib) in proof.iter().enumerate() {
        node = if (index >> k) & 1 == 1 {
            hashv(&[sib.as_ref(), node.as_ref()]).to_bytes()
        } else {
            hashv(&[node.as_ref(), sib.as_ref()]).to_bytes()
        };
    }
    node
}

/// The keeper can only load the slice the VRF chose: the leaf is rebuilt from the loaded bytes
/// and must sit at `leaf_index` (from the VRF callback) under `Raid.day_root`.
pub fn verify_slice(
    ctx: Context<VerifySlice>,
    day_id: [u8; DAY_ID_LEN],
    slice_start: u32,
    headlines_hash: [u8; 32],
    proof: Vec<[u8; 32]>,
) -> Result<()> {
    let raid = &ctx.accounts.raid;
    require!(raid.mode == mode::MYSTERY, RazkynError::BadMode);
    require!(raid.status == status::SEEDED, RazkynError::NotSeeded);
    require!(proof.len() <= MAX_PROOF_LEN, RazkynError::BadProof);
    let mut s = ctx.accounts.secret.load_mut()?;
    require!(s.loaded_chunks == ALL_CHUNKS, RazkynError::SliceNotLoaded);
    let data_hash = hashv(&[bytemuck::cast_slice::<u32, u8>(&s.slice)]).to_bytes();
    let leaf = mystery_leaf(&day_id, slice_start, &data_hash, &headlines_hash);
    require!(merkle_root(leaf, s.leaf_index, &proof) == raid.day_root, RazkynError::BadProof);
    s.slice_hash = data_hash;
    s.slice_start = slice_start;
    s.day_id[..DAY_ID_LEN].copy_from_slice(&day_id);
    s.verified = 1;
    Ok(())
}

// ---------------- market step (called from tick) ----------------

/// Validated Live price (skill pricing-oracle.md): canonical feed account, owner PriCems…,
/// unchecked decode (feeds are PriceUpdateV3), feed_id == account, posted_slot > 0, fresh
/// upstream publish_time, positive. The stored exponent is ignored: indexes are ratios.
pub fn read_feed(info: &AccountInfo, expected: &Pubkey, now: i64) -> Option<u64> {
    if info.key != expected || info.owner != &ORACLE_PROGRAM_ID {
        return None;
    }
    let data = info.try_borrow_data().ok()?;
    let pu = PriceUpdateV2::try_deserialize_unchecked(&mut data.as_ref()).ok()?;
    let m = &pu.price_message;
    if m.feed_id != info.key.to_bytes() || pu.posted_slot == 0 || m.price <= 0 {
        return None;
    }
    if now.saturating_sub(m.publish_time) > FEED_MAX_AGE_SECS {
        return None;
    }
    Some(m.price as u64)
}

pub fn push_price(d: &mut District, index: u64) {
    // The start is 100.0000 by construction: Mystery slices are rebased to step 0, Live indexes
    // to the first read. Not "the first price seen": the first tick can land after step 0
    // (seen on devnet, M3), which would shift every threshold measured from the start.
    if d.hist_len == 0 {
        d.start_price = PRICE_ONE;
    }
    d.current_price = index;
    d.history[d.hist_pos as usize] = index;
    d.hist_pos = (d.hist_pos + 1) % d.history.len() as u8;
    d.hist_len = d.hist_len.saturating_add(1).min(d.history.len() as u8);
}

// ---------------- trades (raid key) ----------------

pub fn at_terminal(x: u16, y: u16) -> bool {
    TERMINALS_TILES.iter().any(|(tx, ty)| {
        let cx = tx * UNITS_PER_TILE + UNITS_PER_TILE / 2;
        let cy = ty * UNITS_PER_TILE + UNITS_PER_TILE / 2;
        dist2(x, y, cx, cy) <= TERMINAL_RANGE_UNITS * TERMINAL_RANGE_UNITS
    })
}

#[derive(Accounts)]
#[instruction(slot: u8)]
pub struct StartTrade<'info> {
    #[account(seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(mut, seeds = [RPRV_SEED, &raid.raid_id.to_le_bytes(), &[slot]], bump = rprv.bump)]
    pub rprv: Account<'info, RaiderPrivate>,
    #[account(mut, seeds = [RPUB_SEED, &raid.raid_id.to_le_bytes(), &[slot]], bump = rpub.bump)]
    pub rpub: Account<'info, RaiderPublic>,
    /// v2: the district the terminal stands in (halt checks).
    #[account(seeds = [DISTRICT_SEED, &raid.raid_id.to_le_bytes(), &[district.index]], bump = district.bump)]
    pub district: Box<Account<'info, District>>,
    pub raid_key: Signer<'info>,
}

/// Start a 3 s swap at a terminal. While channelling, the trader's position is public.
pub fn start_trade(ctx: Context<StartTrade>, slot: u8, from_asset: u8, to_asset: u8, units: u64) -> Result<()> {
    let clock = Clock::get()?;
    require_can_act(&ctx.accounts.raid, slot, &ctx.accounts.raid_key.key(), clock.unix_timestamp)?;
    require!(
        (from_asset as usize) < NUM_ASSETS && (to_asset as usize) < NUM_ASSETS && from_asset != to_asset && units > 0,
        RazkynError::BadTrade
    );
    let p = &mut ctx.accounts.rprv;
    require!(p.channel_kind != CH_TRADE, RazkynError::Trading);
    require!(p.backpack[from_asset as usize] >= units, RazkynError::InsufficientUnits);
    require!(at_terminal(p.x, p.y), RazkynError::NotAtTerminal);
    // Trading halts: a crashing district (hazard level 2) trips its circuit breaker, and a
    // TRADING HALT market event closes the district's terminals while it runs.
    let d = &ctx.accounts.district;
    require!(district_of(p.x) == Some(d.index as usize), RazkynError::BadAccount);
    let raid = &ctx.accounts.raid;
    let halted_event = raid.event_kind == EVENT_TRADING_HALT && raid.event_district == d.index && clock.unix_timestamp < raid.event_until;
    require!(d.hazard_level < 2 && !halted_event, RazkynError::TradingHalted);
    p.channel_kind = CH_TRADE;
    p.channel_arg = from_asset | (to_asset << 4);
    p.channel_units = units;
    p.channel_start_slot = clock.slot;
    let u = &mut ctx.accounts.rpub;
    u.exposed = true;
    u.pub_x = p.x;
    u.pub_y = p.y;
    Ok(())
}

#[derive(Accounts)]
#[instruction(slot: u8)]
pub struct FinishTrade<'info> {
    #[account(seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(mut, seeds = [RPRV_SEED, &raid.raid_id.to_le_bytes(), &[slot]], bump = rprv.bump)]
    pub rprv: Account<'info, RaiderPrivate>,
    #[account(mut, seeds = [RPUB_SEED, &raid.raid_id.to_le_bytes(), &[slot]], bump = rpub.bump)]
    pub rpub: Account<'info, RaiderPublic>,
    #[account(seeds = [DISTRICT_SEED, &raid.raid_id.to_le_bytes(), &[0]], bump = district0.bump)]
    pub district0: Box<Account<'info, District>>,
    #[account(seeds = [DISTRICT_SEED, &raid.raid_id.to_le_bytes(), &[1]], bump = district1.bump)]
    pub district1: Box<Account<'info, District>>,
    #[account(seeds = [DISTRICT_SEED, &raid.raid_id.to_le_bytes(), &[2]], bump = district2.bump)]
    pub district2: Box<Account<'info, District>>,
    pub raid_key: Signer<'info>,
}

/// After ≥ 3 s: swap at the then-current prices, no spread. to = units × p_from / p_to
/// (floor). Exposure ends.
pub fn finish_trade(ctx: Context<FinishTrade>, slot: u8) -> Result<()> {
    let clock = Clock::get()?;
    require_can_act(&ctx.accounts.raid, slot, &ctx.accounts.raid_key.key(), clock.unix_timestamp)?;
    let prices = [
        ctx.accounts.district0.current_price,
        ctx.accounts.district1.current_price,
        ctx.accounts.district2.current_price,
    ];
    let p = &mut ctx.accounts.rprv;
    require!(p.channel_kind == CH_TRADE, RazkynError::NoChannel);
    let need = if ctx.accounts.raid.classes[slot as usize] == CLASS_TRADER { TRADER_TRADE_SLOTS } else { TRADE_CHANNEL_SLOTS };
    require!(clock.slot >= p.channel_start_slot.saturating_add(need), RazkynError::ChannelNotDone);
    let (from, to) = ((p.channel_arg & 0x0f) as usize, (p.channel_arg >> 4) as usize);
    let units = p.channel_units;
    require!(p.backpack[from] >= units, RazkynError::InsufficientUnits);
    require!(prices[from] > 0 && prices[to] > 0, RazkynError::BadFeed);
    let out = (units as u128)
        .checked_mul(prices[from] as u128)
        .ok_or(RazkynError::Overflow)?
        / prices[to] as u128;
    let out = u64::try_from(out).map_err(|_| error!(RazkynError::Overflow))?;
    p.backpack[from] -= units;
    p.backpack[to] = p.backpack[to].checked_add(out).ok_or(RazkynError::Overflow)?;
    p.channel_kind = CH_NONE;
    ctx.accounts.rpub.exposed = false;
    msg!("trade slot={} {}->{} units={} out={} p_from={} p_to={}", slot, from, to, units, out, prices[from], prices[to]);
    Ok(())
}

#[derive(Accounts)]
#[instruction(slot: u8)]
pub struct CancelTrade<'info> {
    #[account(seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(mut, seeds = [RPRV_SEED, &raid.raid_id.to_le_bytes(), &[slot]], bump = rprv.bump)]
    pub rprv: Account<'info, RaiderPrivate>,
    #[account(mut, seeds = [RPUB_SEED, &raid.raid_id.to_le_bytes(), &[slot]], bump = rpub.bump)]
    pub rpub: Account<'info, RaiderPublic>,
    pub raid_key: Signer<'info>,
}

/// Abandon a trade: no swap, exposure ends.
pub fn cancel_trade(ctx: Context<CancelTrade>, slot: u8) -> Result<()> {
    let clock = Clock::get()?;
    require_can_act(&ctx.accounts.raid, slot, &ctx.accounts.raid_key.key(), clock.unix_timestamp)?;
    require!(ctx.accounts.rprv.channel_kind == CH_TRADE, RazkynError::NoChannel);
    ctx.accounts.rprv.channel_kind = CH_NONE;
    ctx.accounts.rpub.exposed = false;
    Ok(())
}
