//! RAZKYN — RAID. TRADE. EXTRACT.
//! A market-driven multiplayer extraction game on Solana (MagicBlock Solana Blitz v10).
//! Spec: CLAUDE.md. Milestone M1: config, mints, faucet, create/join/delegate, permissions,
//! VRF seed + derivations, tick, movement, fog View. M2: crates, open, shoot, drops, hazards.
//! M3: Mystery slice + verify_slice, market steps (slice or oracle), trades with exposure.
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod util;

use instructions::*;

declare_id!("CTJGR8bj7HAzFja1YGjvkc9wP2JrFnachqMLeoniox97");

#[ephemeral]
#[program]
pub mod razkyn {
    use super::*;

    // ---- setup (base) ----
    pub fn init_config(ctx: Context<InitConfig>, keeper: Pubkey, ops_treasury: Pubkey) -> Result<()> {
        instructions::admin::init_config(ctx, keeper, ops_treasury)
    }
    pub fn faucet_dusd(ctx: Context<Faucet>, amount: u64) -> Result<()> {
        instructions::admin::faucet_dusd(ctx, amount)
    }
    pub fn faucet_play(ctx: Context<Faucet>, amount: u64) -> Result<()> {
        instructions::admin::faucet_play(ctx, amount)
    }

    // ---- lobby (base) ----
    pub fn create_raid(
        ctx: Context<CreateRaid>,
        raid_id: u64,
        mode: u8,
        leaf_count: u32,
        day_root: [u8; 32],
        event_plan_hash: [u8; 32],
    ) -> Result<()> {
        instructions::lobby::create_raid(ctx, raid_id, mode, leaf_count, day_root, event_plan_hash)
    }
    pub fn create_slot(ctx: Context<CreateSlot>, slot: u8) -> Result<()> {
        instructions::lobby::create_slot(ctx, slot)
    }
    pub fn create_districts(ctx: Context<CreateDistricts>) -> Result<()> {
        instructions::lobby::create_districts(ctx)
    }
    pub fn join_raid(ctx: Context<JoinRaid>, slot: u8, raid_key: Pubkey) -> Result<()> {
        instructions::lobby::join_raid(ctx, slot, raid_key)
    }
    pub fn delegate_pda(ctx: Context<DelegateRaidPda>, raid_id: u64, account: RaidAccount) -> Result<()> {
        instructions::lobby::delegate_pda(ctx, raid_id, account)
    }

    // ---- TEE setup (keeper) ----
    pub fn setup_slot_permissions(ctx: Context<SetupSlotPermissions>, slot: u8) -> Result<()> {
        instructions::tee_setup::setup_slot_permissions(ctx, slot)
    }
    pub fn setup_secret_permission(ctx: Context<SetupSecretPermission>) -> Result<()> {
        instructions::tee_setup::setup_secret_permission(ctx)
    }
    pub fn request_raid_vrf(ctx: Context<RequestRaidVrf>) -> Result<()> {
        instructions::tee_setup::request_raid_vrf(ctx)
    }
    pub fn vrf_callback_raid<'info>(
        ctx: Context<'info, VrfCallbackRaid<'info>>,
        randomness: [u8; 32],
        nonce: u32,
    ) -> Result<()> {
        instructions::tee_setup::vrf_callback_raid(ctx, randomness, nonce)
    }
    pub fn start_raid(ctx: Context<StartRaid>) -> Result<()> {
        instructions::tee_setup::start_raid(ctx)
    }

    // ---- crates (M2) ----
    pub fn create_crates<'info>(ctx: Context<'info, CreateCrates<'info>>, first: u8, count: u8) -> Result<()> {
        instructions::crates::create_crates(ctx, first, count)
    }
    pub fn place_crates<'info>(ctx: Context<'info, PlaceCrates<'info>>, first: u8, count: u8) -> Result<()> {
        instructions::crates::place_crates(ctx, first, count)
    }
    pub fn open_crate(ctx: Context<OpenCrate>, slot: u8, idx: u8) -> Result<()> {
        instructions::crates::open_crate(ctx, slot, idx)
    }
    pub fn finish_open(ctx: Context<FinishOpen>, slot: u8, idx: u8) -> Result<()> {
        instructions::crates::finish_open(ctx, slot, idx)
    }
    pub fn shoot(ctx: Context<Shoot>, slot: u8, target: u8) -> Result<()> {
        instructions::crates::shoot(ctx, slot, target)
    }
    pub fn drop_backpack(ctx: Context<DropBackpack>, slot: u8) -> Result<()> {
        instructions::crates::drop_backpack(ctx, slot)
    }

    // ---- market (M3) ----
    pub fn load_slice(ctx: Context<LoadSlice>, chunk: u8, bytes: Vec<u8>) -> Result<()> {
        instructions::market::load_slice(ctx, chunk, bytes)
    }
    pub fn verify_slice(
        ctx: Context<VerifySlice>,
        day_id: [u8; 10],
        slice_start: u32,
        headlines_hash: [u8; 32],
        proof: Vec<[u8; 32]>,
    ) -> Result<()> {
        instructions::market::verify_slice(ctx, day_id, slice_start, headlines_hash, proof)
    }
    pub fn start_trade(ctx: Context<StartTrade>, slot: u8, from_asset: u8, to_asset: u8, units: u64) -> Result<()> {
        instructions::market::start_trade(ctx, slot, from_asset, to_asset, units)
    }
    pub fn finish_trade(ctx: Context<FinishTrade>, slot: u8) -> Result<()> {
        instructions::market::finish_trade(ctx, slot)
    }
    pub fn cancel_trade(ctx: Context<CancelTrade>, slot: u8) -> Result<()> {
        instructions::market::cancel_trade(ctx, slot)
    }

    // ---- gameplay (TEE) ----
    pub fn move_to(ctx: Context<MoveTo>, slot: u8, dx: i16, dy: i16) -> Result<()> {
        instructions::play::move_to(ctx, slot, dx, dy)
    }
    pub fn tick(ctx: Context<Tick>) -> Result<()> {
        instructions::play::tick(ctx)
    }
    pub fn tick_raiders<'info>(ctx: Context<'info, TickRaiders<'info>>) -> Result<()> {
        instructions::play::tick_raiders(ctx)
    }
}
