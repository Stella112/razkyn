//! M2: crates (create on base, place on the TEE from the VRF seed), open / finish_open,
//! shoot (death → drop crate), drop_backpack (hazard deaths).
use crate::constants::*;
use crate::errors::RazkynError;
use crate::instructions::play::require_can_act;
use crate::state::*;
use crate::util::*;
use anchor_lang::prelude::*;
use anchor_lang::system_program::{create_account, CreateAccount};
use ephemeral_rollups_sdk::access_control::instructions::UpdateEphemeralPermissionCpi;
use ephemeral_rollups_sdk::access_control::structs::{EphemeralMembersArgs, EphemeralPermission, Member, TX_LOGS_FLAG};
use ephemeral_rollups_sdk::consts::{EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID};
use ephemeral_rollups_sdk::ephemeral_accounts::rent as permission_rent;

// ---------------- create_crates (base) ----------------

#[derive(Accounts)]
pub struct CreateCrates<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = keeper @ RazkynError::Unauthorized)]
    pub config: Box<Account<'info, Config>>,
    #[account(seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump, constraint = raid.status == status::LOBBY @ RazkynError::BadStatus)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(mut)]
    pub keeper: Signer<'info>,
    pub system_program: Program<'info, System>,
    // remaining_accounts: crate PDAs for idx first..first+count (writable, not yet created).
}

/// Creates crate accounts `first..first+count`. Regular crates (idx < 36) are pre-funded for a
/// keeper-only permission. Nothing secret is written on base: contents are placed on the TEE.
pub fn create_crates<'info>(ctx: Context<'info, CreateCrates<'info>>, first: u8, count: u8) -> Result<()> {
    let raid_id = ctx.accounts.raid.raid_id;
    let id = raid_id.to_le_bytes();
    let last = first.checked_add(count).ok_or(RazkynError::Overflow)?;
    require!((last as usize) <= NUM_CRATES + MAX_RAIDERS, RazkynError::BadAccount);
    let space = 8 + Crate::INIT_SPACE;
    let rent = Rent::get()?.minimum_balance(space);
    for (k, idx) in (first..last).enumerate() {
        let info = ctx.remaining_accounts.get(k).ok_or(RazkynError::BadAccount)?;
        let (expected, bump) = Pubkey::find_program_address(&[CRATE_SEED, &id, &[idx]], &crate::ID);
        require_keys_eq!(*info.key, expected, RazkynError::BadAccount);
        require!(info.lamports() == 0 && info.data_is_empty(), RazkynError::BadAccount);
        let extra = if (idx as usize) < NUM_CRATES {
            permission_rent(EphemeralPermission::size_of(1) as u32)
        } else {
            0
        };
        create_account(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.key(),
                CreateAccount { from: ctx.accounts.keeper.to_account_info(), to: info.clone() },
                &[&[CRATE_SEED, &id, &[idx], &[bump]]],
            ),
            rent.checked_add(extra).ok_or(RazkynError::Overflow)?,
            space as u64,
            &crate::ID,
        )?;
        store(info, &Crate {
            raid_id,
            idx,
            district: 0,
            dormant: false,
            placed: false,
            state: crate_state::SEALED,
            x: 0,
            y: 0,
            units: [0; NUM_ASSETS],
            opened_units: [0; NUM_ASSETS],
            opened_by: 255,
            bump,
        })?;
    }
    Ok(())
}

// ---------------- place_crates (TEE, keeper) ----------------

#[derive(Accounts)]
pub struct PlaceCrates<'info> {
    #[account(mut, seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump, has_one = keeper @ RazkynError::Unauthorized)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(seeds = [SECRET_SEED, &raid.raid_id.to_le_bytes()], bump)]
    pub secret: AccountLoader<'info, RaidSecret>,
    #[account(mut)]
    pub keeper: Signer<'info>,
    /// CHECK: Permission Program.
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
    /// CHECK: ephemeral vault.
    #[account(mut, address = EPHEMERAL_VAULT_ID)]
    pub ephemeral_vault: UncheckedAccount<'info>,
    /// CHECK: Magic Program.
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
    // remaining_accounts: (crate, crate permission) pairs for idx first..first+count.
}

/// Loot units for every regular crate: the 55% loot pool (5.5 dUSD × raiders) split by
/// VRF weights 1..=100; the last crate takes the rounding remainder so the sum is exact.
pub fn crate_units(seed: &[u8; 32], joined: u8) -> Result<[u64; NUM_CRATES]> {
    let pool = LOOT_POOL.checked_mul(joined as u64).ok_or(RazkynError::Overflow)?;
    let mut w = [0u64; NUM_CRATES];
    let mut total = 0u64;
    for (j, wj) in w.iter_mut().enumerate() {
        *wj = 1 + derive_u64(seed, b"crate_w", j as u32) % 100;
        total += *wj;
    }
    let mut out = [0u64; NUM_CRATES];
    let mut used = 0u64;
    for j in 0..NUM_CRATES - 1 {
        out[j] = ((pool as u128 * w[j] as u128) / total as u128) as u64;
        used = used.checked_add(out[j]).ok_or(RazkynError::Overflow)?;
    }
    out[NUM_CRATES - 1] = pool.checked_sub(used).ok_or(RazkynError::Overflow)?;
    Ok(out)
}

/// Crate position: inside its district's x range (one tile in from the edges), rows 2..=37.
pub fn crate_position(seed: &[u8; 32], idx: u8) -> (u16, u16) {
    let d = idx as usize / CRATES_PER_DISTRICT;
    let (lo, hi) = DISTRICT_X_TILES[d];
    let h = derive(seed, b"crate_pos", idx as u32);
    let span_x = (hi - lo - 1) as u64; // tiles lo+1 ..= hi-1
    let tx = lo + 1 + (u64::from_le_bytes([h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]]) % span_x) as u16;
    let ty = 2 + (u64::from_le_bytes([h[8], h[9], h[10], h[11], h[12], h[13], h[14], h[15]]) % 36) as u16;
    (tx * UNITS_PER_TILE + UNITS_PER_TILE / 2, ty * UNITS_PER_TILE + UNITS_PER_TILE / 2)
}

pub fn place_crates<'info>(ctx: Context<'info, PlaceCrates<'info>>, first: u8, count: u8) -> Result<()> {
    let raid = &ctx.accounts.raid;
    require!(raid.status == status::SEEDED, RazkynError::NotSeeded);
    let last = first.checked_add(count).ok_or(RazkynError::Overflow)?;
    require!((last as usize) <= NUM_CRATES, RazkynError::BadAccount);
    let seed = ctx.accounts.secret.load()?.seed;
    let units = crate_units(&seed, raid.joined_count)?;
    let id = raid.raid_id.to_le_bytes();
    let keeper = raid.keeper;
    let mut placed = raid.crates_placed;
    for (k, idx) in (first..last).enumerate() {
        let cinfo = ctx.remaining_accounts.get(2 * k).ok_or(RazkynError::BadAccount)?;
        let pinfo = ctx.remaining_accounts.get(2 * k + 1).ok_or(RazkynError::BadAccount)?;
        let mut c: Crate = load(cinfo)?;
        check_pda(cinfo, &[CRATE_SEED, &id, &[idx]], c.bump)?;
        if c.placed {
            continue;
        }
        // Permission first, then the secret contents (CLAUDE.md §4.4).
        create_private_permission(
            cinfo.clone(),
            pinfo.clone(),
            ctx.accounts.ephemeral_vault.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
            ctx.accounts.permission_program.to_account_info(),
            &[CRATE_SEED, &id, &[idx], &[c.bump]],
            vec![Member { flags: TX_LOGS_FLAG, pubkey: keeper }],
            1,
        )?;
        let c2: Crate = load(cinfo)?; // lamports changed by the CPI; data did not
        c = c2;
        let d = idx as usize / CRATES_PER_DISTRICT;
        let (x, y) = crate_position(&seed, idx);
        c.district = d as u8;
        c.dormant = idx as usize % CRATES_PER_DISTRICT >= ACTIVE_PER_DISTRICT;
        c.x = x;
        c.y = y;
        c.units = [0; NUM_ASSETS];
        c.units[d] = units[idx as usize];
        c.placed = true;
        store(cinfo, &c)?;
        placed |= 1u64 << idx;
        ctx.accounts.raid.crate_pos[idx as usize] = CratePos { x, y };
    }
    ctx.accounts.raid.crates_placed = placed;
    Ok(())
}

// ---------------- open_crate / finish_open (raid key) ----------------

#[derive(Accounts)]
#[instruction(slot: u8, idx: u8)]
pub struct OpenCrate<'info> {
    #[account(seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(mut, seeds = [RPRV_SEED, &raid.raid_id.to_le_bytes(), &[slot]], bump = rprv.bump)]
    pub rprv: Account<'info, RaiderPrivate>,
    #[account(seeds = [CRATE_SEED, &raid.raid_id.to_le_bytes(), &[idx]], bump = crate_acc.bump)]
    pub crate_acc: Account<'info, Crate>,
    #[account(seeds = [DISTRICT_SEED, &raid.raid_id.to_le_bytes(), &[crate_acc.district]], bump = district.bump)]
    pub district: Account<'info, District>,
    pub raid_key: Signer<'info>,
}

/// Start the 2 s channel on a sealed crate within 1 tile. Dormant crates need their district
/// awake (≥ +2% vs start at some point).
pub fn open_crate(ctx: Context<OpenCrate>, slot: u8, idx: u8) -> Result<()> {
    let clock = Clock::get()?;
    require_can_act(&ctx.accounts.raid, slot, &ctx.accounts.raid_key.key(), clock.unix_timestamp)?;
    let c = &ctx.accounts.crate_acc;
    require!(c.placed && c.state == crate_state::SEALED, RazkynError::CrateNotOpenable);
    require!(!c.dormant || ctx.accounts.district.awake, RazkynError::CrateDormant);
    let p = &mut ctx.accounts.rprv;
    require!(dist2(p.x, p.y, c.x, c.y) <= OPEN_RANGE_UNITS * OPEN_RANGE_UNITS, RazkynError::OutOfRange);
    p.channel_kind = CH_OPEN;
    p.channel_arg = idx;
    p.channel_start_slot = clock.slot;
    Ok(())
}

#[derive(Accounts)]
#[instruction(slot: u8, idx: u8)]
pub struct FinishOpen<'info> {
    #[account(seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(mut, seeds = [RPRV_SEED, &raid.raid_id.to_le_bytes(), &[slot]], bump = rprv.bump)]
    pub rprv: Account<'info, RaiderPrivate>,
    #[account(mut, seeds = [CRATE_SEED, &raid.raid_id.to_le_bytes(), &[idx]], bump = crate_acc.bump)]
    pub crate_acc: Account<'info, Crate>,
    /// CHECK: the crate's permission PDA; checked below. Required for regular crates, omitted for
    /// public drop crates (they have no permission, and the TEE rejects a tx that lists a
    /// non-delegated account as writable).
    #[account(mut)]
    pub crate_permission: Option<UncheckedAccount<'info>>,
    pub raid_key: Signer<'info>,
    /// CHECK: Permission Program.
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
    /// CHECK: ephemeral vault.
    #[account(mut, address = EPHEMERAL_VAULT_ID)]
    pub ephemeral_vault: UncheckedAccount<'info>,
    /// CHECK: Magic Program.
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
}

/// After ≥ 2 s of channel and still within 1 tile: move the crate's units into the backpack
/// and make the crate public (its permission is switched to public, so anyone can read what
/// it held).
pub fn finish_open(ctx: Context<FinishOpen>, slot: u8, idx: u8) -> Result<()> {
    let clock = Clock::get()?;
    require_can_act(&ctx.accounts.raid, slot, &ctx.accounts.raid_key.key(), clock.unix_timestamp)?;
    let raid_id = ctx.accounts.raid.raid_id;
    {
        let p = &ctx.accounts.rprv;
        require!(p.channel_kind == CH_OPEN && p.channel_arg == idx, RazkynError::NoChannel);
        require!(
            clock.slot >= p.channel_start_slot.saturating_add(OPEN_CHANNEL_SLOTS),
            RazkynError::ChannelNotDone
        );
        let c = &ctx.accounts.crate_acc;
        require!(c.state == crate_state::SEALED, RazkynError::CrateNotOpenable);
        require!(dist2(p.x, p.y, c.x, c.y) <= OPEN_RANGE_UNITS * OPEN_RANGE_UNITS, RazkynError::OutOfRange);
    }
    let units = ctx.accounts.crate_acc.units;
    {
        let p = &mut ctx.accounts.rprv;
        for a in 0..NUM_ASSETS {
            p.backpack[a] = p.backpack[a].checked_add(units[a]).ok_or(RazkynError::Overflow)?;
        }
        p.channel_kind = CH_NONE;
    }
    {
        let c = &mut ctx.accounts.crate_acc;
        c.opened_units = units;
        c.units = [0; NUM_ASSETS];
        c.state = crate_state::OPENED;
        c.opened_by = slot;
    }
    if (idx as usize) < NUM_CRATES {
        let permission = ctx.accounts.crate_permission.as_ref().ok_or(RazkynError::BadAccount)?;
        let (expected, _) = EphemeralPermission::find_pda(&ctx.accounts.crate_acc.key());
        require_keys_eq!(permission.key(), expected, RazkynError::BadAccount);
        let bump = ctx.accounts.crate_acc.bump;
        let id = raid_id.to_le_bytes();
        let info = ctx.accounts.crate_acc.to_account_info();
        UpdateEphemeralPermissionCpi {
            payer: info.clone(),
            permissioned_account: info.clone(),
            permission: permission.to_account_info(),
            vault: ctx.accounts.ephemeral_vault.to_account_info(),
            magic_program: ctx.accounts.magic_program.to_account_info(),
            permission_program: ctx.accounts.permission_program.to_account_info(),
            authority: info,
            authority_is_signer: false,
            args: EphemeralMembersArgs { is_private: false, members: vec![] },
        }
        .invoke_signed(&[&[CRATE_SEED, &id, &[idx], &[bump]]])?;
    }
    Ok(())
}

// ---------------- shoot (raid key) ----------------

#[derive(Accounts)]
#[instruction(slot: u8, target: u8)]
pub struct Shoot<'info> {
    #[account(mut, seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(mut, seeds = [RPRV_SEED, &raid.raid_id.to_le_bytes(), &[slot]], bump = shooter_prv.bump)]
    pub shooter_prv: Account<'info, RaiderPrivate>,
    #[account(mut, seeds = [RPUB_SEED, &raid.raid_id.to_le_bytes(), &[slot]], bump = shooter_pub.bump)]
    pub shooter_pub: Account<'info, RaiderPublic>,
    #[account(mut, seeds = [RPRV_SEED, &raid.raid_id.to_le_bytes(), &[target]], bump = target_prv.bump)]
    pub target_prv: Account<'info, RaiderPrivate>,
    #[account(mut, seeds = [RPUB_SEED, &raid.raid_id.to_le_bytes(), &[target]], bump = target_pub.bump)]
    pub target_pub: Account<'info, RaiderPublic>,
    #[account(mut, seeds = [CRATE_SEED, &raid.raid_id.to_le_bytes(), &[DROP_CRATE_BASE + target]], bump = drop_crate.bump)]
    pub drop_crate: Account<'info, Crate>,
    pub raid_key: Signer<'info>,
}

/// Cooldown 500 ms, range 6 tiles (from private positions), target alive. 34 damage.
/// On a kill: mark dead, publish the last position, move the backpack into the drop crate.
pub fn shoot(ctx: Context<Shoot>, slot: u8, target: u8) -> Result<()> {
    let clock = Clock::get()?;
    require_can_act(&ctx.accounts.raid, slot, &ctx.accounts.raid_key.key(), clock.unix_timestamp)?;
    require!(target != slot && (target as usize) < MAX_RAIDERS, RazkynError::BadTarget);
    let t = ctx.accounts.raid.raiders[target as usize];
    require!(t.joined && t.alive && !t.extracted, RazkynError::BadTarget);
    let sp = &mut ctx.accounts.shooter_prv;
    let since = sp.last_shot_slot.max(ctx.accounts.raid.start_slot.saturating_sub(SHOT_COOLDOWN_SLOTS));
    require!(clock.slot >= since.saturating_add(SHOT_COOLDOWN_SLOTS), RazkynError::Cooldown);
    let tp = &ctx.accounts.target_prv;
    require!(dist2(sp.x, sp.y, tp.x, tp.y) <= SHOOT_RANGE_UNITS * SHOOT_RANGE_UNITS, RazkynError::OutOfRange);
    sp.last_shot_slot = clock.slot;

    let tpub = &mut ctx.accounts.target_pub;
    tpub.hp = tpub.hp.saturating_sub(SHOT_DAMAGE);
    if tpub.hp == 0 {
        ctx.accounts.shooter_pub.kills = ctx.accounts.shooter_pub.kills.saturating_add(1);
        kill(
            &mut ctx.accounts.raid,
            target,
            &mut ctx.accounts.target_pub,
            &mut ctx.accounts.target_prv,
        );
        drop_into(&mut ctx.accounts.target_prv, &mut ctx.accounts.drop_crate)?;
    }
    Ok(())
}

/// Mark a raider dead and publish their last position.
pub fn kill(raid: &mut Raid, slot: u8, rpub: &mut RaiderPublic, rprv: &mut RaiderPrivate) {
    raid.raiders[slot as usize].alive = false;
    rpub.hp = 0;
    rpub.alive = false;
    rpub.exposed = true;
    rpub.pub_x = rprv.x;
    rpub.pub_y = rprv.y;
    rprv.channel_kind = CH_NONE;
}

/// Move a dead raider's whole backpack into their (public) drop crate at their position.
pub fn drop_into(rprv: &mut RaiderPrivate, c: &mut Crate) -> Result<()> {
    for a in 0..NUM_ASSETS {
        c.units[a] = c.units[a].checked_add(rprv.backpack[a]).ok_or(RazkynError::Overflow)?;
        rprv.backpack[a] = 0;
    }
    c.x = rprv.x;
    c.y = rprv.y;
    c.district = district_of(rprv.x).unwrap_or(0) as u8;
    c.dormant = false;
    c.placed = true;
    c.state = crate_state::SEALED;
    Ok(())
}

// ---------------- drop_backpack (permissionless, hazard deaths) ----------------

#[derive(Accounts)]
#[instruction(slot: u8)]
pub struct DropBackpack<'info> {
    #[account(seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(mut, seeds = [RPUB_SEED, &raid.raid_id.to_le_bytes(), &[slot]], bump = rpub.bump)]
    pub rpub: Account<'info, RaiderPublic>,
    #[account(mut, seeds = [RPRV_SEED, &raid.raid_id.to_le_bytes(), &[slot]], bump = rprv.bump)]
    pub rprv: Account<'info, RaiderPrivate>,
    #[account(mut, seeds = [CRATE_SEED, &raid.raid_id.to_le_bytes(), &[DROP_CRATE_BASE + slot]], bump = drop_crate.bump)]
    pub drop_crate: Account<'info, Crate>,
}

pub fn drop_backpack(ctx: Context<DropBackpack>, _slot: u8) -> Result<()> {
    if !ctx.accounts.rpub.pending_drop {
        return Ok(());
    }
    ctx.accounts.rpub.pending_drop = false;
    drop_into(&mut ctx.accounts.rprv, &mut ctx.accounts.drop_crate)
}
