//! TEE (keeper): setup_slot_permissions, setup_secret_permission, request_raid_vrf,
//! vrf_callback_raid, start_raid.
use crate::constants::*;
use crate::errors::RazkynError;
use crate::state::*;
use crate::util::*;
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::access_control::structs::{Member, TX_LOGS_FLAG};
use ephemeral_rollups_sdk::anchor::{vrf, vrf_callback};
use ephemeral_rollups_sdk::consts::{EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID};
use ephemeral_rollups_sdk::vrf::{
    consts::{program_identity_pubkey, scoped_vrf_identity_const, DEFAULT_EPHEMERAL_QUEUE},
    instructions::{create_request_randomness_ix_const, RequestRandomnessParams},
    types::SerializableAccountMeta,
};

/// Requester identity PDA (compile time; skill vrf.md).
const PROGRAM_IDENTITY: Pubkey = program_identity_pubkey(&crate::ID);
/// Scoped VRF identity for callbacks, computed at compile time. The `#[vrf_callback]` macro
/// injects the same check but evaluates it at runtime (~261k CU, M0/S4); declaring the field
/// ourselves makes the macro skip its injection. DECISIONS.md #3.
pub const VRF_CALLBACK_IDENTITY: Pubkey = Pubkey::new_from_array(scoped_vrf_identity_const(&crate::ID).0);

/// Members see their account; no member gets AUTHORITY_FLAG (the PDA itself is the permission
/// authority and only this program can sign for it).
fn reader(pubkey: Pubkey) -> Member {
    Member { flags: TX_LOGS_FLAG, pubkey }
}

// ---------------- setup_slot_permissions ----------------

#[derive(Accounts)]
#[instruction(slot: u8)]
pub struct SetupSlotPermissions<'info> {
    #[account(mut, seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump, has_one = keeper @ RazkynError::Unauthorized)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(mut, seeds = [RPRV_SEED, &raid.raid_id.to_le_bytes(), &[slot]], bump = rprv.bump)]
    pub rprv: Account<'info, RaiderPrivate>,
    #[account(mut, seeds = [VIEW_SEED, &raid.raid_id.to_le_bytes(), &[slot]], bump = view.bump)]
    pub view: Account<'info, View>,
    /// CHECK: permission PDA of rprv (checked in create_private_permission).
    #[account(mut)]
    pub rprv_permission: UncheckedAccount<'info>,
    /// CHECK: permission PDA of view (checked in create_private_permission).
    #[account(mut)]
    pub view_permission: UncheckedAccount<'info>,
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
}

pub fn setup_slot_permissions(ctx: Context<SetupSlotPermissions>, slot: u8) -> Result<()> {
    let raid = &ctx.accounts.raid;
    require!(raid.status == status::LOBBY, RazkynError::BadStatus);
    require!((slot as usize) < MAX_RAIDERS, RazkynError::BadSlot);
    let rs = raid.raiders[slot as usize];
    require!(rs.joined, RazkynError::SlotNotJoined);
    require_keys_eq!(ctx.accounts.rprv.raid_key, rs.raid_key, RazkynError::BadRaidKey);
    let id = raid.raid_id.to_le_bytes();
    let keeper = raid.keeper;
    create_private_permission(
        ctx.accounts.rprv.to_account_info(),
        ctx.accounts.rprv_permission.to_account_info(),
        ctx.accounts.ephemeral_vault.to_account_info(),
        ctx.accounts.magic_program.to_account_info(),
        ctx.accounts.permission_program.to_account_info(),
        &[RPRV_SEED, &id, &[slot], &[ctx.accounts.rprv.bump]],
        vec![reader(rs.raid_key), reader(keeper)],
        RPRV_PERMISSION_MEMBERS,
    )?;
    create_private_permission(
        ctx.accounts.view.to_account_info(),
        ctx.accounts.view_permission.to_account_info(),
        ctx.accounts.ephemeral_vault.to_account_info(),
        ctx.accounts.magic_program.to_account_info(),
        ctx.accounts.permission_program.to_account_info(),
        &[VIEW_SEED, &id, &[slot], &[ctx.accounts.view.bump]],
        vec![reader(rs.raid_key)],
        VIEW_PERMISSION_MEMBERS,
    )?;
    ctx.accounts.raid.perm_mask |= 1 << slot;
    Ok(())
}

// ---------------- setup_secret_permission ----------------

#[derive(Accounts)]
pub struct SetupSecretPermission<'info> {
    #[account(mut, seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump, has_one = keeper @ RazkynError::Unauthorized)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(mut, seeds = [SECRET_SEED, &raid.raid_id.to_le_bytes()], bump)]
    pub secret: AccountLoader<'info, RaidSecret>,
    /// CHECK: permission PDA of secret (checked in create_private_permission).
    #[account(mut)]
    pub secret_permission: UncheckedAccount<'info>,
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
}

pub fn setup_secret_permission(ctx: Context<SetupSecretPermission>) -> Result<()> {
    require!(ctx.accounts.raid.status == status::LOBBY, RazkynError::BadStatus);
    let id = ctx.accounts.raid.raid_id.to_le_bytes();
    create_private_permission(
        ctx.accounts.secret.to_account_info(),
        ctx.accounts.secret_permission.to_account_info(),
        ctx.accounts.ephemeral_vault.to_account_info(),
        ctx.accounts.magic_program.to_account_info(),
        ctx.accounts.permission_program.to_account_info(),
        &[SECRET_SEED, &id, &[ctx.bumps.secret]],
        vec![reader(ctx.accounts.raid.keeper)],
        SECRET_PERMISSION_MEMBERS,
    )?;
    ctx.accounts.raid.perm_mask |= SECRET_PERM_BIT;
    Ok(())
}

// ---------------- request_raid_vrf ----------------

#[vrf]
#[derive(Accounts)]
pub struct RequestRaidVrf<'info> {
    #[account(mut)]
    pub keeper: Signer<'info>,
    #[account(mut, seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump, has_one = keeper @ RazkynError::Unauthorized)]
    pub raid: Box<Account<'info, Raid>>,
    /// CHECK: delegated VRF queue (request is sent inside the TEE).
    #[account(mut, address = DEFAULT_EPHEMERAL_QUEUE)]
    pub oracle_queue: UncheckedAccount<'info>,
}

/// State machine: NONE → PENDING(nonce) → FULFILLED. A PENDING request may be superseded
/// after VRF_RETRY_SECS; the callback only accepts the current nonce.
pub fn request_raid_vrf(ctx: Context<RequestRaidVrf>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let raid_key = ctx.accounts.raid.key();
    let raid = &mut ctx.accounts.raid;
    require!(raid.status == status::LOBBY, RazkynError::BadStatus);
    require!(raid.joined_count >= MIN_RAIDERS, RazkynError::NotEnoughRaiders);
    require!(raid.all_permissions_ready(), RazkynError::PermissionsMissing);
    match raid.vrf_state {
        vrf_state::NONE => {}
        vrf_state::PENDING => require!(
            now >= raid.vrf_requested_ts.saturating_add(VRF_RETRY_SECS),
            RazkynError::VrfPending
        ),
        _ => return err!(RazkynError::BadStatus),
    }
    raid.vrf_nonce = raid.vrf_nonce.checked_add(1).ok_or(RazkynError::Overflow)?;
    raid.vrf_state = vrf_state::PENDING;
    raid.vrf_requested_ts = now;

    let id = raid.raid_id.to_le_bytes();
    let (secret, _) = Pubkey::find_program_address(&[SECRET_SEED, &id], &crate::ID);
    let mut metas = vec![
        SerializableAccountMeta { pubkey: raid_key, is_signer: false, is_writable: true },
        SerializableAccountMeta { pubkey: secret, is_signer: false, is_writable: true },
    ];
    for (i, r) in raid.raiders.iter().enumerate() {
        if r.joined {
            let (rprv, _) = Pubkey::find_program_address(&[RPRV_SEED, &id, &[i as u8]], &crate::ID);
            metas.push(SerializableAccountMeta { pubkey: rprv, is_signer: false, is_writable: true });
        }
    }
    let caller_seed = solana_sha256_hasher::hashv(&[b"razkyn-vrf".as_ref(), id.as_ref(), raid.vrf_nonce.to_le_bytes().as_ref()]).to_bytes();
    let ix = create_request_randomness_ix_const(
        RequestRandomnessParams {
            payer: ctx.accounts.keeper.key(),
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: crate::ID,
            callback_discriminator: crate::instruction::VrfCallbackRaid::DISCRIMINATOR.to_vec(),
            caller_seed,
            accounts_metas: Some(metas),
            callback_args: Some(raid.vrf_nonce.to_le_bytes().to_vec()),
        },
        PROGRAM_IDENTITY,
    );
    ctx.accounts.invoke_signed_vrf(&ctx.accounts.keeper.to_account_info(), &ix)?;
    Ok(())
}

// ---------------- vrf_callback_raid ----------------

#[vrf_callback]
#[derive(Accounts)]
pub struct VrfCallbackRaid<'info> {
    /// Scoped VRF identity signer: proves the VRF program issued this callback for us.
    #[account(address = VRF_CALLBACK_IDENTITY)]
    pub vrf_program_identity: Signer<'info>,
    #[account(mut, seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(mut, seeds = [SECRET_SEED, &raid.raid_id.to_le_bytes()], bump)]
    pub secret: AccountLoader<'info, RaidSecret>,
    // remaining_accounts: RaiderPrivate for each joined slot, in slot order.
}

/// Derives (domain-separated, CLAUDE.md §6.3) spawns, the exit plan and the mystery leaf
/// index. Results go only into private accounts. Crates are added in M2.
pub fn vrf_callback_raid<'info>(
    ctx: Context<'info, VrfCallbackRaid<'info>>,
    randomness: [u8; 32],
    nonce: u32,
) -> Result<()> {
    let raid = &mut ctx.accounts.raid;
    require!(
        raid.vrf_state == vrf_state::PENDING && nonce == raid.vrf_nonce,
        RazkynError::VrfMismatch
    );
    require!(raid.status == status::LOBBY, RazkynError::BadStatus);
    let id = raid.raid_id.to_le_bytes();

    {
        let mut s = ctx.accounts.secret.load_mut()?;
        s.seed = randomness;
        s.seeded = 1;
        for w in 0..EXIT_WINDOW_STARTS.len() {
            let pair = exit_pair(&randomness, w as u32);
            s.exit_plan[2 * w] = pair[0];
            s.exit_plan[2 * w + 1] = pair[1];
        }
        if raid.leaf_count > 0 {
            s.leaf_index = (derive_u64(&randomness, b"leaf", 0) % raid.leaf_count as u64) as u32;
        }
        // Market event plan: two distinct kinds, a district each, a second in [60, 210).
        let first = (derive_u64(&randomness, b"evk", 0) % 3) as u8 + 1;
        let second = (first + (derive_u64(&randomness, b"evk", 1) % 2) as u8) % 3 + 1;
        for (i, kind) in [first, second].into_iter().enumerate() {
            let district = (derive_u64(&randomness, b"evd", i as u32) % NUM_DISTRICTS as u64) as u8;
            let at = (EVENT_MIN_AT + derive_u64(&randomness, b"evt", i as u32) % EVENT_AT_SPAN) as u16;
            s.events[4 * i] = kind;
            s.events[4 * i + 1] = district;
            s.events[4 * i + 2..4 * i + 4].copy_from_slice(&at.to_le_bytes());
        }
        // Commit the plan publicly by hash; the plan itself stays private until each event fires.
        raid.event_plan_hash = solana_sha256_hasher::hashv(&[b"razkyn-events".as_ref(), s.events.as_ref()]).to_bytes();
    }

    let mut k = 0usize;
    for (i, r) in raid.raiders.iter().enumerate() {
        if !r.joined {
            continue;
        }
        let info = ctx.remaining_accounts.get(k).ok_or(RazkynError::BadAccount)?;
        k += 1;
        let mut p: RaiderPrivate = load(info)?;
        check_pda(info, &[RPRV_SEED, &id, &[i as u8]], p.bump)?;
        let (x, y) = spawn_point(&randomness, i as u32);
        p.x = x;
        p.y = y;
        store(info, &p)?;
    }
    raid.vrf_state = vrf_state::FULFILLED;
    raid.status = status::SEEDED;
    Ok(())
}

// ---------------- start_raid ----------------

#[derive(Accounts)]
pub struct StartRaid<'info> {
    #[account(mut, seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump, has_one = keeper @ RazkynError::Unauthorized)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(seeds = [SECRET_SEED, &raid.raid_id.to_le_bytes()], bump)]
    pub secret: AccountLoader<'info, RaidSecret>,
    pub keeper: Signer<'info>,
}

pub fn start_raid(ctx: Context<StartRaid>) -> Result<()> {
    let clock = Clock::get()?;
    let raid = &mut ctx.accounts.raid;
    require!(raid.status == status::SEEDED, RazkynError::NotSeeded);
    require!(raid.crates_placed == ALL_CRATES_PLACED, RazkynError::CratesNotPlaced);
    // Mystery: the raid cannot start until the VRF-chosen slice is verified (CLAUDE.md §6.3).
    if raid.mode == mode::MYSTERY {
        require!(ctx.accounts.secret.load()?.verified == 1, RazkynError::SliceNotVerified);
    }
    raid.status = status::LIVE;
    raid.start_ts = clock.unix_timestamp;
    raid.end_ts = clock.unix_timestamp.checked_add(RAID_SECS).ok_or(RazkynError::Overflow)?;
    raid.start_slot = clock.slot;
    raid.last_tick_slot = clock.slot;
    raid.prev_tick_slot = clock.slot;
    Ok(())
}
