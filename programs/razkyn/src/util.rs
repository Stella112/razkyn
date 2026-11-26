use crate::constants::*;
use crate::errors::RazkynError;
use anchor_lang::prelude::*;
use solana_sha256_hasher::hashv;
use ephemeral_rollups_sdk::access_control::instructions::CreateEphemeralPermissionCpi;
use ephemeral_rollups_sdk::access_control::structs::{EphemeralMembersArgs, Member, PERMISSION_SEED};
use ephemeral_rollups_sdk::consts::PERMISSION_PROGRAM_ID;

// ---------------- randomness (CLAUDE.md §6.3: hash(seed ‖ label ‖ i)) ----------------

pub fn derive(seed: &[u8; 32], label: &[u8], i: u32) -> [u8; 32] {
    hashv(&[seed.as_ref(), label, &i.to_le_bytes()]).to_bytes()
}

pub fn derive_u64(seed: &[u8; 32], label: &[u8], i: u32) -> u64 {
    let h = derive(seed, label, i);
    u64::from_le_bytes([h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]])
}

/// Edge spawn point for raider `slot`: a random side, then a random point along it.
pub fn spawn_point(seed: &[u8; 32], slot: u32) -> (u16, u16) {
    let h = derive(seed, b"spawn", slot);
    let along = u64::from_le_bytes([h[8], h[9], h[10], h[11], h[12], h[13], h[14], h[15]]);
    let inset = UNITS_PER_TILE / 2;
    match h[0] % 4 {
        0 => ((along % (MAX_X as u64 + 1)) as u16, inset),
        1 => ((along % (MAX_X as u64 + 1)) as u16, MAX_Y - inset),
        2 => (inset, (along % (MAX_Y as u64 + 1)) as u16),
        _ => (MAX_X - inset, (along % (MAX_Y as u64 + 1)) as u16),
    }
}

/// Two distinct exits (of NUM_EXITS) for exit window `w`.
pub fn exit_pair(seed: &[u8; 32], w: u32) -> [u8; 2] {
    let h = derive(seed, b"exit", w);
    let a = h[0] % NUM_EXITS as u8;
    let b = (a + 1 + h[1] % (NUM_EXITS as u8 - 1)) % NUM_EXITS as u8;
    [a, b]
}

pub fn exit_point_units(exit: u8) -> (u16, u16) {
    let (tx, ty) = EXIT_POINTS_TILES[exit as usize];
    (tx * UNITS_PER_TILE + UNITS_PER_TILE / 2, ty * UNITS_PER_TILE + UNITS_PER_TILE / 2)
}

/// District index for an x position (units); None on the 1-tile roads between districts.
pub fn district_of(x: u16) -> Option<usize> {
    let tx = x / UNITS_PER_TILE;
    DISTRICT_X_TILES.iter().position(|(lo, hi)| tx >= *lo && tx <= *hi)
}

/// Is (x, y) on an active hazard tile, given the hazard level of the district it stands in?
pub fn in_hazard(y: u16, level: u8) -> bool {
    let ty = y / UNITS_PER_TILE;
    match level {
        1 => ty >= HAZARD1_ROWS.0 && ty <= HAZARD1_ROWS.1,
        l if l >= 2 => ty >= HAZARD2_ROWS.0 && ty <= HAZARD2_ROWS.1,
        _ => false,
    }
}

/// Price change vs raid start in basis points (0 when no start price yet).
pub fn change_bps(start: u64, current: u64) -> i64 {
    if start == 0 {
        return 0;
    }
    ((current as i128 - start as i128) * 10_000 / start as i128) as i64
}

pub fn dist2(ax: u16, ay: u16, bx: u16, by: u16) -> u64 {
    let dx = (ax as i64 - bx as i64).unsigned_abs();
    let dy = (ay as i64 - by as i64).unsigned_abs();
    dx * dx + dy * dy
}

// ---------------- PER permissions (skill delegation.md, ER-local permissions) ----------------

/// Create the ER-local `EphemeralPermission` for a delegated PDA. The PDA pays the rent
/// (pre-funded on base) and is the permission authority, signing with its own seeds.
/// Idempotent: skips when the permission already exists.
#[allow(clippy::too_many_arguments)]
pub fn create_private_permission<'info>(
    permissioned: AccountInfo<'info>,
    permission: AccountInfo<'info>,
    vault: AccountInfo<'info>,
    magic_program: AccountInfo<'info>,
    permission_program: AccountInfo<'info>,
    signer_seeds: &[&[u8]],
    members: Vec<Member>,
    max_members: usize,
) -> Result<()> {
    require!(members.len() <= max_members, RazkynError::TooManyMembers);
    let (expected, _) = Pubkey::find_program_address(
        &[PERMISSION_SEED, permissioned.key.as_ref()],
        &PERMISSION_PROGRAM_ID,
    );
    require_keys_eq!(*permission.key, expected, RazkynError::BadAccount);
    if permission.owner == &PERMISSION_PROGRAM_ID && !permission.data_is_empty() {
        msg!("permission exists");
        return Ok(());
    }
    CreateEphemeralPermissionCpi {
        payer: permissioned.clone(),
        permissioned_account: permissioned,
        permission,
        vault,
        magic_program,
        permission_program,
        args: EphemeralMembersArgs {
            is_private: true,
            members,
        },
    }
    .invoke_signed(&[signer_seeds])?;
    Ok(())
}

// ---------------- slot accounts passed as remaining accounts ----------------

/// Check that `info` is this program's PDA for `seeds` + stored `bump`.
pub fn check_pda(info: &AccountInfo, seeds: &[&[u8]], bump: u8) -> Result<()> {
    require_keys_eq!(*info.owner, crate::ID, RazkynError::BadAccount);
    let mut s: Vec<&[u8]> = seeds.to_vec();
    let b = [bump];
    s.push(&b);
    let k = Pubkey::create_program_address(&s, &crate::ID).map_err(|_| error!(RazkynError::BadAccount))?;
    require_keys_eq!(*info.key, k, RazkynError::BadAccount);
    Ok(())
}

pub fn load<T: AccountDeserialize>(info: &AccountInfo) -> Result<T> {
    let data = info.try_borrow_data()?;
    T::try_deserialize(&mut data.as_ref())
}

pub fn store<T: AccountSerialize>(info: &AccountInfo, value: &T) -> Result<()> {
    let mut data = info.try_borrow_mut_data()?;
    let mut w: &mut [u8] = &mut data;
    value.try_serialize(&mut w)
}

// ---------------- cover (DECISIONS #42) ----------------

pub fn tile_blocked(tx: u16, ty: u16) -> bool {
    COVER_RECTS.iter().any(|&(x0, y0, x1, y1)| tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1)
}

/// Is this position (units) on a cover tile?
pub fn pos_blocked(x: u16, y: u16) -> bool {
    tile_blocked(x / UNITS_PER_TILE, y / UNITS_PER_TILE)
}

/// No cover tile on the segment a → b (sampled every LOS_STEP_UNITS, both ends included).
pub fn line_clear(ax: u16, ay: u16, bx: u16, by: u16) -> bool {
    let dx = bx as i64 - ax as i64;
    let dy = by as i64 - ay as i64;
    // Integer only: samples every LOS_STEP_UNITS along the longer axis (spacing <= 20·√2 ≈ 28 units < 1 tile).
    let span = dx.unsigned_abs().max(dy.unsigned_abs());
    let n = (span / LOS_STEP_UNITS).max(1) as i64;
    (0..=n).all(|i| {
        let x = ax as i64 + dx * i / n;
        let y = ay as i64 + dy * i / n;
        !pos_blocked(x as u16, y as u16)
    })
}
