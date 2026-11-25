//! RAZKYN M0 spike program (CLAUDE.md §10). Throwaway: it exists only to prove the
//! MagicBlock platform paths the game depends on, on devnet. Not the game program.
//!
//! S1 PER      : `Secret` PDA delegated to the TEE, `EphemeralPermission` created on the ER.
//! S2 tick     : permissionless `tick` + raid-key-signed `move_to` on the TEE.
//! S3 oracle   : `read_oracle` validates a Pricing Oracle feed on the TEE.
//! S4 VRF      : `request_vrf` (#[vrf]) on the TEE with DEFAULT_EPHEMERAL_QUEUE, `vrf_callback` (#[vrf_callback]).
//! S5 action   : commit-and-undelegate `Probe` with a post-commit #[action] `set_flag` on base.
//! S6 crank    : `schedule_crank` (ScheduleCrankCpi, 1.x scheduler) running `crank_tick`.
//!
//! SDK symbols used (ephemeral-rollups-sdk =0.18.0, vendor/ephemeral-rollups-sdk/rust/sdk/src):
//! - access_control::instructions::CreateEphemeralPermissionCpi  (access_control/instructions/create_ephemeral_permission.rs)
//! - access_control::structs::{EphemeralPermission, EphemeralMembersArgs, Member, AUTHORITY_FLAG, TX_LOGS_FLAG, PERMISSION_SEED}
//! - anchor::{ephemeral, delegate, commit, action, vrf, vrf_callback} (anchor.rs)
//! - ephem::{MagicIntentBundleBuilder, CallHandler} (ephem/mod.rs, ephem/deprecated/v1.rs)
//! - {ActionArgs, ShortAccountMeta} (lib.rs re-export of magicblock_magic_program_api::args)
//! - pda::ephemeral_balance_pda_from_payer (dlp_api re-export)
//! - vrf::{consts::{program_identity_pubkey, DEFAULT_QUEUE, DEFAULT_EPHEMERAL_QUEUE}, instructions::{create_request_randomness_ix_const, RequestRandomnessParams}, types::SerializableAccountMeta}
//! - crank::{ScheduleCrankCpi, ScheduleTaskArgs} (crank/legacy.rs; deprecated, but it is the path the 1.x TEE scheduler runs)
//! - ephemeral_accounts::rent (ephemeral_accounts.rs)

#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::system_program::{transfer, Transfer};
use ephemeral_rollups_sdk::access_control::instructions::CreateEphemeralPermissionCpi;
use ephemeral_rollups_sdk::access_control::structs::{
    EphemeralMembersArgs, EphemeralPermission, Member, AUTHORITY_FLAG, PERMISSION_SEED,
    TX_LOGS_FLAG,
};
use ephemeral_rollups_sdk::anchor::{action, commit, delegate, ephemeral, vrf, vrf_callback};
use ephemeral_rollups_sdk::consts::{EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
#[allow(deprecated)]
use ephemeral_rollups_sdk::crank::{ScheduleCrankCpi, ScheduleTaskArgs};
use ephemeral_rollups_sdk::ephem::{CallHandler, MagicIntentBundleBuilder};
use ephemeral_rollups_sdk::vrf::{
    consts::program_identity_pubkey,
    instructions::{create_request_randomness_ix_const, RequestRandomnessParams},
    types::SerializableAccountMeta,
};
use ephemeral_rollups_sdk::{ActionArgs, ShortAccountMeta};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

declare_id!("AQ9D9GCfwopEQCRjqFzykJgxG3QnWEZrxSDz3WjZKTj6");

pub const PROBE_SEED: &[u8] = b"probe";
pub const SECRET_SEED: &[u8] = b"secret";
pub const FLAG_SEED: &[u8] = b"flag";
/// `ActionArgs::new` default escrow index (skill magic-actions.md).
pub const ACTION_ESCROW_INDEX: u8 = 255;
/// Max members the Secret permission is pre-funded for.
pub const MAX_PERMISSION_MEMBERS: usize = 2;
/// MagicBlock Pricing Oracle program (CLAUDE.md §4.3, skill pricing-oracle.md).
pub const ORACLE_PROGRAM_ID: Pubkey = pubkey!("PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd");
/// Requester identity PDA, derived at compile time (SDK 0.18, skill vrf.md).
const PROGRAM_IDENTITY: Pubkey = program_identity_pubkey(&crate::ID);

#[ephemeral]
#[program]
pub mod razkyn_spike {
    use super::*;

    // ---------------- base layer ----------------

    /// Base: create Probe (public), Secret (to be private; no secret data written here) and
    /// Flag (base only). Pre-funds Secret for its ER permission rent.
    pub fn init(ctx: Context<Init>, id: u64, raid_key: Pubkey, min_tick_slots: u64) -> Result<()> {
        transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                Transfer {
                    from: ctx.accounts.authority.to_account_info(),
                    to: ctx.accounts.secret.to_account_info(),
                },
            ),
            ephemeral_rollups_sdk::ephemeral_accounts::rent(
                EphemeralPermission::size_of(MAX_PERMISSION_MEMBERS) as u32,
            ),
        )?;
        let p = &mut ctx.accounts.probe;
        p.id = id;
        p.authority = ctx.accounts.authority.key();
        p.raid_key = raid_key;
        p.min_tick_slots = min_tick_slots;
        p.x = 100;
        p.y = 100;
        let s = &mut ctx.accounts.secret;
        s.id = id;
        s.authority = ctx.accounts.authority.key();
        s.value = 0; // never write the secret on base (CLAUDE.md §4.4)
        let f = &mut ctx.accounts.flag;
        f.id = id;
        Ok(())
    }

    /// Base: delegate Probe or Secret to the validator passed in `validator`.
    pub fn delegate_pda(ctx: Context<DelegatePda>, account_type: AccountType) -> Result<()> {
        let seed_data = account_type.seeds();
        let seeds_refs: Vec<&[u8]> = seed_data.iter().map(|s| s.as_slice()).collect();
        let validator = ctx.accounts.validator.as_ref().map(|v| v.key());
        ctx.accounts.delegate_pda(
            &ctx.accounts.payer,
            &seeds_refs,
            DelegateConfig {
                validator,
                ..Default::default()
            },
        )?;
        Ok(())
    }

    // ---------------- S1: PER ----------------

    /// ER: create the Secret's EphemeralPermission with `member` as the only member.
    /// Idempotent. Only the Secret's authority (keeper) may call it.
    pub fn create_permission(ctx: Context<PermissionCtx>, member: Pubkey) -> Result<()> {
        if ctx.accounts.permission.owner == &PERMISSION_PROGRAM_ID
            && !ctx.accounts.permission.data_is_empty()
        {
            msg!("permission already exists");
            return Ok(());
        }
        let id_bytes = ctx.accounts.secret.id.to_le_bytes();
        let signer_seeds: &[&[u8]] = &[SECRET_SEED, &id_bytes, &[ctx.bumps.secret]];
        CreateEphemeralPermissionCpi {
            payer: ctx.accounts.secret.to_account_info(),
            permissioned_account: ctx.accounts.secret.to_account_info(),
            permission: ctx.accounts.permission.to_account_info(),
            vault: ctx.accounts.ephemeral_vault.to_account_info(),
            magic_program: ctx.accounts.magic_program.to_account_info(),
            permission_program: ctx.accounts.permission_program.to_account_info(),
            args: EphemeralMembersArgs {
                is_private: true,
                members: vec![Member {
                    flags: AUTHORITY_FLAG | TX_LOGS_FLAG,
                    pubkey: member,
                }],
            },
        }
        .invoke_signed(&[signer_seeds])?;
        Ok(())
    }

    /// ER: write the secret value (only after the permission exists).
    pub fn write_secret(ctx: Context<WriteSecret>, value: u64) -> Result<()> {
        ctx.accounts.secret.value = value;
        Ok(())
    }

    // ---------------- S2: tick + move ----------------

    /// ER: permissionless, clock-gated tick. Never fails when early: it is a no-op, so the
    /// keeper can call it at a fixed cadence and the program decides whether to advance.
    pub fn tick(ctx: Context<Tick>) -> Result<()> {
        let p = &mut ctx.accounts.probe;
        let slot = Clock::get()?.slot;
        p.tick_calls = p.tick_calls.checked_add(1).ok_or(SpikeError::Overflow)?;
        if slot >= p.last_tick_slot.saturating_add(p.min_tick_slots) {
            p.tick_no = p.tick_no.checked_add(1).ok_or(SpikeError::Overflow)?;
            p.last_tick_slot = slot;
        }
        Ok(())
    }

    /// ER: raid-key-signed move with a speed limit (spike: |dx|,|dy| <= 60 units).
    pub fn move_to(ctx: Context<MoveTo>, dx: i16, dy: i16) -> Result<()> {
        let p = &mut ctx.accounts.probe;
        require!(dx.unsigned_abs() <= 60 && dy.unsigned_abs() <= 60, SpikeError::TooFast);
        let nx = (p.x as i32).checked_add(dx as i32).ok_or(SpikeError::Overflow)?;
        let ny = (p.y as i32).checked_add(dy as i32).ok_or(SpikeError::Overflow)?;
        require!((0..=6300).contains(&nx) && (0..=3900).contains(&ny), SpikeError::OutOfBounds);
        p.x = nx as u16;
        p.y = ny as u16;
        p.moves = p.moves.checked_add(1).ok_or(SpikeError::Overflow)?;
        Ok(())
    }

    // ---------------- S3: oracle ----------------

    /// ER: read a Pricing Oracle feed with full validation (skill pricing-oracle.md):
    /// canonical PDA, owner PriCems…, unchecked decode, feed_id == account key,
    /// posted_slot > 0, fresh upstream publish_time, positive price. The exponent is
    /// NOT taken from the account (stored +8 is wrong); the caller supplies it from the
    /// feed list and it is only logged here.
    pub fn read_oracle(
        ctx: Context<ReadOracle>,
        lazer_id: u32,
        feed_list_exponent: i32,
        max_age_secs: i64,
    ) -> Result<()> {
        let feed = &ctx.accounts.price_feed;
        let id_str = lazer_id.to_string();
        let (expected, _) = Pubkey::find_program_address(
            &[b"price_feed", b"pyth-lazer", id_str.as_bytes()],
            &ORACLE_PROGRAM_ID,
        );
        require_keys_eq!(feed.key(), expected, SpikeError::WrongFeed);
        require_keys_eq!(*feed.owner, ORACLE_PROGRAM_ID, SpikeError::WrongFeedOwner);
        let data = feed.try_borrow_data()?;
        let pu = PriceUpdateV2::try_deserialize_unchecked(&mut data.as_ref())
            .map_err(|_| error!(SpikeError::FeedDecode))?;
        drop(data);
        require!(pu.price_message.feed_id == feed.key().to_bytes(), SpikeError::WrongFeed);
        require!(pu.posted_slot > 0, SpikeError::NotPosted);
        let now = Clock::get()?.unix_timestamp;
        let age = now.saturating_sub(pu.price_message.publish_time);
        msg!(
            "oracle lazer_id={} price={} stored_exponent={} feed_list_exponent={} publish_time={} now={} age_s={} posted_slot={}",
            lazer_id,
            pu.price_message.price,
            pu.price_message.exponent,
            feed_list_exponent,
            pu.price_message.publish_time,
            now,
            age,
            pu.posted_slot
        );
        require!(age <= max_age_secs, SpikeError::StalePrice);
        require!(pu.price_message.price > 0, SpikeError::BadPrice);
        let p = &mut ctx.accounts.probe;
        p.price = pu.price_message.price;
        p.price_publish_time = pu.price_message.publish_time;
        p.price_posted_slot = pu.posted_slot;
        p.price_reads = p.price_reads.checked_add(1).ok_or(SpikeError::Overflow)?;
        Ok(())
    }

    // ---------------- S4: VRF ----------------

    /// Request randomness. Works on base (DEFAULT_QUEUE) or inside the ER
    /// (DEFAULT_EPHEMERAL_QUEUE). One live request at a time.
    pub fn request_vrf(ctx: Context<RequestVrf>, client_seed: u8) -> Result<()> {
        let probe_key = ctx.accounts.probe.key();
        let p = &mut ctx.accounts.probe;
        require!(!p.pending_vrf, SpikeError::VrfPending);
        p.pending_vrf = true;
        p.vrf_requests = p.vrf_requests.checked_add(1).ok_or(SpikeError::Overflow)?;
        let ix = create_request_randomness_ix_const(
            RequestRandomnessParams {
                payer: ctx.accounts.payer.key(),
                oracle_queue: ctx.accounts.oracle_queue.key(),
                callback_program_id: crate::ID,
                callback_discriminator: instruction::VrfCallback::DISCRIMINATOR.to_vec(),
                caller_seed: [client_seed; 32],
                accounts_metas: Some(vec![SerializableAccountMeta {
                    pubkey: probe_key,
                    is_signer: false,
                    is_writable: true,
                }]),
                ..Default::default()
            },
            PROGRAM_IDENTITY,
        );
        ctx.accounts
            .invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &ix)?;
        Ok(())
    }

    /// VRF callback, authenticated by #[vrf_callback] (scoped identity signer).
    pub fn vrf_callback(ctx: Context<VrfCallback>, randomness: [u8; 32]) -> Result<()> {
        let p = &mut ctx.accounts.probe;
        require!(p.pending_vrf, SpikeError::NoPendingVrf);
        p.pending_vrf = false;
        p.rnd = randomness;
        p.vrf_fulfilled = p.vrf_fulfilled.checked_add(1).ok_or(SpikeError::Overflow)?;
        msg!("vrf fulfilled #{}", p.vrf_fulfilled);
        Ok(())
    }

    // ---------------- S5: commit-and-undelegate + Magic Action ----------------

    /// ER: commit + undelegate Probe with one post-commit action `set_flag(fail)` on base.
    pub fn commit_with_action(ctx: Context<CommitWithAction>, fail: bool) -> Result<()> {
        let action = CallHandler {
            destination_program: crate::ID,
            accounts: vec![
                ShortAccountMeta {
                    pubkey: ctx.accounts.flag.key().to_bytes().into(),
                    is_writable: true,
                },
                ShortAccountMeta {
                    pubkey: ctx.accounts.probe.key().to_bytes().into(),
                    is_writable: false,
                },
            ],
            args: ActionArgs::new(anchor_lang::InstructionData::data(
                &crate::instruction::SetFlag { fail },
            )),
            escrow_authority: ctx.accounts.payer.to_account_info(),
            compute_units: 200_000,
        };
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit_and_undelegate(&[ctx.accounts.probe.to_account_info()])
        .add_post_commit_actions([action])
        .build_and_invoke()?;
        Ok(())
    }

    /// Base: post-commit action target. Authenticated by the escrow signer.
    /// `fail = true` forces an error so we can observe what the committor does.
    pub fn set_flag(ctx: Context<SetFlag>, fail: bool) -> Result<()> {
        let probe_info = ctx.accounts.probe.to_account_info();
        msg!("set_flag: probe owner at action time = {}", probe_info.owner);
        let data = probe_info.try_borrow_data()?;
        let probe = Probe::try_deserialize(&mut data.as_ref())?;
        drop(data);
        msg!("set_flag: committed probe tick_no={} moves={}", probe.tick_no, probe.moves);
        require!(!fail, SpikeError::ForcedActionFailure);
        let f = &mut ctx.accounts.flag;
        f.set = true;
        f.count = f.count.checked_add(1).ok_or(SpikeError::Overflow)?;
        f.committed_tick_no = probe.tick_no;
        Ok(())
    }

    // ---------------- S6: crank ----------------

    /// ER: schedule `crank_tick` every `interval_ms` for `iterations` runs (1.x ScheduleTask).
    #[allow(deprecated)]
    pub fn schedule_crank<'info>(
        ctx: Context<'info, ScheduleCrank<'info>>,
        task_id: i64,
        interval_ms: i64,
        iterations: i64,
    ) -> Result<()> {
        {
            let data = ctx.accounts.probe.try_borrow_data()?;
            Probe::try_deserialize(&mut data.as_ref())?; // must be a Probe
        }
        let crank_ix = Instruction {
            program_id: crate::ID,
            accounts: vec![AccountMeta::new(ctx.accounts.probe.key(), false)],
            data: anchor_lang::InstructionData::data(&crate::instruction::CrankTick {}),
        };
        ScheduleCrankCpi {
            payer: &ctx.accounts.payer,
            magic_program: &&ctx.accounts.magic_program,
            instruction_accounts: &[
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.probe.to_account_info(),
            ],
            args: ScheduleTaskArgs {
                task_id,
                execution_interval_millis: interval_ms,
                iterations,
                instructions: vec![crank_ix],
            },
        }
        .invoke()?;
        Ok(())
    }

    /// ER: target of the scheduled crank (permissionless counter for the spike).
    pub fn crank_tick(ctx: Context<Tick>) -> Result<()> {
        let p = &mut ctx.accounts.probe;
        p.crank_ticks = p.crank_ticks.checked_add(1).ok_or(SpikeError::Overflow)?;
        p.last_crank_slot = Clock::get()?.slot;
        Ok(())
    }
}

// ---------------- contexts ----------------

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct Init<'info> {
    #[account(init, payer = authority, space = 8 + Probe::LEN, seeds = [PROBE_SEED, &id.to_le_bytes()], bump)]
    pub probe: Account<'info, Probe>,
    #[account(init, payer = authority, space = 8 + Secret::LEN, seeds = [SECRET_SEED, &id.to_le_bytes()], bump)]
    pub secret: Account<'info, Secret>,
    #[account(init, payer = authority, space = 8 + Flag::LEN, seeds = [FLAG_SEED, &id.to_le_bytes()], bump)]
    pub flag: Account<'info, Flag>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegatePda<'info> {
    /// CHECK: the PDA to delegate; seeds are re-derived from `account_type`.
    #[account(mut, del)]
    pub pda: UncheckedAccount<'info>,
    pub payer: Signer<'info>,
    /// CHECK: validator identity forwarded in DelegateConfig.
    pub validator: Option<UncheckedAccount<'info>>,
}

#[derive(Accounts)]
pub struct PermissionCtx<'info> {
    #[account(mut, seeds = [SECRET_SEED, &secret.id.to_le_bytes()], bump, has_one = authority)]
    pub secret: Account<'info, Secret>,
    /// CHECK: derived and checked under the Permission Program.
    #[account(mut, seeds = [PERMISSION_SEED, secret.key().as_ref()], bump, seeds::program = PERMISSION_PROGRAM_ID)]
    pub permission: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: Permission Program.
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
    /// CHECK: Ephemeral vault.
    #[account(mut, address = EPHEMERAL_VAULT_ID)]
    pub ephemeral_vault: UncheckedAccount<'info>,
    /// CHECK: Magic Program.
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct WriteSecret<'info> {
    #[account(mut, seeds = [SECRET_SEED, &secret.id.to_le_bytes()], bump, has_one = authority)]
    pub secret: Account<'info, Secret>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct Tick<'info> {
    #[account(mut, seeds = [PROBE_SEED, &probe.id.to_le_bytes()], bump)]
    pub probe: Account<'info, Probe>,
}

#[derive(Accounts)]
pub struct MoveTo<'info> {
    #[account(mut, seeds = [PROBE_SEED, &probe.id.to_le_bytes()], bump, constraint = probe.raid_key == raid_key.key() @ SpikeError::WrongSigner)]
    pub probe: Account<'info, Probe>,
    pub raid_key: Signer<'info>,
}

#[derive(Accounts)]
pub struct ReadOracle<'info> {
    #[account(mut, seeds = [PROBE_SEED, &probe.id.to_le_bytes()], bump)]
    pub probe: Account<'info, Probe>,
    /// CHECK: Pricing Oracle PriceUpdateV3 feed; key + owner checked in the handler.
    pub price_feed: UncheckedAccount<'info>,
}

#[vrf]
#[derive(Accounts)]
pub struct RequestVrf<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [PROBE_SEED, &probe.id.to_le_bytes()], bump, has_one = authority @ SpikeError::WrongSigner)]
    pub probe: Account<'info, Probe>,
    /// CHECK: must equal the payer (keeper) for the spike.
    #[account(address = payer.key())]
    pub authority: UncheckedAccount<'info>,
    /// CHECK: VRF oracle queue (base or ephemeral default).
    #[account(
        mut,
        constraint = oracle_queue.key() == ephemeral_rollups_sdk::vrf::consts::DEFAULT_QUEUE
            || oracle_queue.key() == ephemeral_rollups_sdk::vrf::consts::DEFAULT_EPHEMERAL_QUEUE
            @ SpikeError::WrongQueue
    )]
    pub oracle_queue: UncheckedAccount<'info>,
}

/// Scoped VRF identity, computed at compile time. The `#[vrf_callback]` macro injects the same
/// check but evaluates `scoped_vrf_identity_const` inside `#[account(address = ..)]`, i.e. at
/// runtime, which costs ~261k CU on-chain (observed on devnet-tee, M0/S4). Declaring the field
/// ourselves makes the macro skip injection (vrf-macro/src/lib.rs) while keeping the same check.
pub const VRF_CALLBACK_IDENTITY: Pubkey = Pubkey::new_from_array(
    ephemeral_rollups_sdk::vrf::consts::scoped_vrf_identity_const(&crate::ID).0,
);

#[vrf_callback]
#[derive(Accounts)]
pub struct VrfCallback<'info> {
    /// Scoped VRF identity PDA signer: proves the VRF program issued this callback for us.
    #[account(address = VRF_CALLBACK_IDENTITY)]
    pub vrf_program_identity: Signer<'info>,
    #[account(mut)]
    pub probe: Account<'info, Probe>,
}

#[commit]
#[derive(Accounts)]
pub struct CommitWithAction<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [PROBE_SEED, &probe.id.to_le_bytes()], bump)]
    pub probe: Account<'info, Probe>,
    /// CHECK: base-only Flag PDA; writable flag is set in the action account list.
    #[account(seeds = [FLAG_SEED, &probe.id.to_le_bytes()], bump)]
    pub flag: UncheckedAccount<'info>,
    /// CHECK: destination program for the scheduled action.
    #[account(address = crate::ID)]
    pub program_id: UncheckedAccount<'info>,
}

#[action]
#[derive(Accounts)]
pub struct SetFlag<'info> {
    #[account(mut, seeds = [FLAG_SEED, &flag.id.to_le_bytes()], bump)]
    pub flag: Account<'info, Flag>,
    /// CHECK: committed Probe; bound to the flag's id.
    #[account(seeds = [PROBE_SEED, &flag.id.to_le_bytes()], bump)]
    pub probe: UncheckedAccount<'info>,
    /// CHECK: program that scheduled the action (passed by DLP CallHandlerV2).
    #[account(address = crate::ID @ SpikeError::WrongSigner)]
    pub source_program: UncheckedAccount<'info>,
    /// CHECK: escrow authority the action was scheduled with.
    pub escrow_auth: UncheckedAccount<'info>,
    /// CHECK: only the delegation program can sign for this PDA.
    #[account(
        signer @ SpikeError::WrongSigner,
        address = ephemeral_rollups_sdk::pda::ephemeral_balance_pda_from_payer(
            &escrow_auth.key(),
            ACTION_ESCROW_INDEX,
        ) @ SpikeError::WrongSigner,
    )]
    pub escrow: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct ScheduleCrank<'info> {
    /// CHECK: Magic program, used for CPI.
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: passed to the CPI; UncheckedAccount avoids re-serializing stale data.
    /// Owner + discriminator are checked in the handler (`Probe::try_deserialize`).
    #[account(mut, owner = crate::ID)]
    pub probe: UncheckedAccount<'info>,
    /// CHECK: this program.
    #[account(address = crate::ID)]
    pub program: UncheckedAccount<'info>,
}

// ---------------- state ----------------

/// Public spike state. Size: 8 disc + Probe::LEN (= 239) bytes.
#[account]
pub struct Probe {
    pub id: u64,
    pub authority: Pubkey,
    pub raid_key: Pubkey,
    pub tick_no: u64,
    pub tick_calls: u64,
    pub last_tick_slot: u64,
    pub min_tick_slots: u64,
    pub x: u16,
    pub y: u16,
    pub moves: u64,
    pub rnd: [u8; 32],
    pub pending_vrf: bool,
    pub vrf_requests: u64,
    pub vrf_fulfilled: u64,
    pub price: i64,
    pub price_publish_time: i64,
    pub price_posted_slot: u64,
    pub price_reads: u64,
    pub crank_ticks: u64,
    pub last_crank_slot: u64,
}
impl Probe {
    pub const LEN: usize = 8 + 32 + 32 + 8 * 4 + 2 + 2 + 8 + 32 + 1 + 8 * 2 + 8 * 4 + 8 * 2;
}

/// Private spike state (S1). Size: 8 disc + 48 bytes.
#[account]
pub struct Secret {
    pub id: u64,
    pub authority: Pubkey,
    pub value: u64,
}
impl Secret {
    pub const LEN: usize = 8 + 32 + 8;
}

/// Base-only flag written by the post-commit action (S5). Size: 8 disc + 25 bytes.
#[account]
pub struct Flag {
    pub id: u64,
    pub set: bool,
    pub count: u64,
    pub committed_tick_no: u64,
}
impl Flag {
    pub const LEN: usize = 8 + 1 + 8 + 8;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum AccountType {
    Probe { id: u64 },
    Secret { id: u64 },
}
impl AccountType {
    fn seeds(&self) -> Vec<Vec<u8>> {
        match self {
            AccountType::Probe { id } => vec![PROBE_SEED.to_vec(), id.to_le_bytes().to_vec()],
            AccountType::Secret { id } => vec![SECRET_SEED.to_vec(), id.to_le_bytes().to_vec()],
        }
    }
}

#[error_code]
pub enum SpikeError {
    #[msg("arithmetic overflow")]
    Overflow,
    #[msg("move exceeds max speed")]
    TooFast,
    #[msg("out of map bounds")]
    OutOfBounds,
    #[msg("wrong signer")]
    WrongSigner,
    #[msg("wrong price feed account")]
    WrongFeed,
    #[msg("price feed not owned by the Pricing Oracle")]
    WrongFeedOwner,
    #[msg("price feed decode failed")]
    FeedDecode,
    #[msg("price feed never posted (posted_slot == 0)")]
    NotPosted,
    #[msg("stale price")]
    StalePrice,
    #[msg("non-positive price")]
    BadPrice,
    #[msg("VRF request already pending")]
    VrfPending,
    #[msg("no VRF request pending")]
    NoPendingVrf,
    #[msg("wrong VRF queue")]
    WrongQueue,
    #[msg("forced action failure (S5 failure mode)")]
    ForcedActionFailure,
}
