//! M4: extraction, end_raid (Results + conservation + commit-and-undelegate with a post-commit
//! Magic Action), reveal_after_end, finalize_raid (#[action]), settle_stuck_raid, claim,
//! post_report_hash, set_test_flags.
//!
//! SDK symbols (ephemeral-rollups-sdk =0.18.0): anchor::{action, commit},
//! ephem::{CallHandler, MagicIntentBundleBuilder}, {ActionArgs, ShortAccountMeta},
//! pda::ephemeral_balance_pda_from_payer, access_control::instructions::UpdateEphemeralPermissionCpi
//! (vendor/ephemeral-rollups-sdk/rust/sdk/src/{anchor.rs,ephem/mod.rs,lib.rs,access_control}).
use crate::constants::*;
use crate::errors::RazkynError;
use crate::instructions::play::require_can_act;
use crate::state::*;
use crate::util::*;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::{get_associated_token_address_with_program_id, AssociatedToken};
use anchor_spl::token_interface::{self, Mint, MintTo, TokenAccount, TokenInterface, TransferChecked};
use ephemeral_rollups_sdk::access_control::instructions::UpdateEphemeralPermissionCpi;
use ephemeral_rollups_sdk::access_control::structs::{EphemeralMembersArgs, EphemeralPermission};
use ephemeral_rollups_sdk::anchor::{action, commit};
use ephemeral_rollups_sdk::consts::{EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID};
// FoldableIntentBuilder: #[ephemeral] only imports it inside the program module (skill delegation.md).
use ephemeral_rollups_sdk::ephem::{CallHandler, FoldableIntentBuilder, MagicIntentBundleBuilder};
use ephemeral_rollups_sdk::{ActionArgs, ShortAccountMeta};

/// `ActionArgs::new` default escrow index (skill magic-actions.md).
pub const ACTION_ESCROW_INDEX: u8 = 255;
pub const TEST_FLAGS_SEED: &[u8] = b"test_flags";

// ======================= extraction (raid key) =======================

#[derive(Accounts)]
#[instruction(slot: u8)]
pub struct StartExtract<'info> {
    #[account(seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(mut, seeds = [RPRV_SEED, &raid.raid_id.to_le_bytes(), &[slot]], bump = rprv.bump)]
    pub rprv: Account<'info, RaiderPrivate>,
    pub raid_key: Signer<'info>,
}

fn exit_open(raid: &Raid, exit: u8) -> bool {
    raid.exit_window > 0 && raid.open_exits.contains(&exit)
}

/// Start the 5 s extraction while standing within 1 tile of an open exit.
pub fn start_extract(ctx: Context<StartExtract>, slot: u8, exit: u8) -> Result<()> {
    let clock = Clock::get()?;
    let raid = &ctx.accounts.raid;
    require_can_act(raid, slot, &ctx.accounts.raid_key.key(), clock.unix_timestamp)?;
    require!((exit as usize) < NUM_EXITS && exit_open(raid, exit), RazkynError::ExitClosed);
    let p = &mut ctx.accounts.rprv;
    require!(p.channel_kind != CH_TRADE, RazkynError::Trading);
    let (ex, ey) = exit_point_units(exit);
    require!(dist2(p.x, p.y, ex, ey) <= EXIT_RANGE_UNITS * EXIT_RANGE_UNITS, RazkynError::OutOfRange);
    p.channel_kind = CH_EXTRACT;
    p.channel_arg = exit;
    p.channel_start_slot = clock.slot;
    Ok(())
}

#[derive(Accounts)]
#[instruction(slot: u8)]
pub struct FinishExtract<'info> {
    #[account(mut, seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(mut, seeds = [RPRV_SEED, &raid.raid_id.to_le_bytes(), &[slot]], bump = rprv.bump)]
    pub rprv: Account<'info, RaiderPrivate>,
    #[account(mut, seeds = [RPUB_SEED, &raid.raid_id.to_le_bytes(), &[slot]], bump = rpub.bump)]
    pub rpub: Account<'info, RaiderPublic>,
    pub raid_key: Signer<'info>,
}

/// After ≥ 5 s, still in range of the exit and the exit still open: extracted. The backpack
/// is frozen (no more actions) and settles to the wallet at claim.
pub fn finish_extract(ctx: Context<FinishExtract>, slot: u8) -> Result<()> {
    let clock = Clock::get()?;
    require_can_act(&ctx.accounts.raid, slot, &ctx.accounts.raid_key.key(), clock.unix_timestamp)?;
    let p = &mut ctx.accounts.rprv;
    require!(p.channel_kind == CH_EXTRACT, RazkynError::NoChannel);
    require!(clock.slot >= p.channel_start_slot.saturating_add(EXTRACT_CHANNEL_SLOTS), RazkynError::ChannelNotDone);
    require!(exit_open(&ctx.accounts.raid, p.channel_arg), RazkynError::ExitClosed);
    let (ex, ey) = exit_point_units(p.channel_arg);
    require!(dist2(p.x, p.y, ex, ey) <= EXIT_RANGE_UNITS * EXIT_RANGE_UNITS, RazkynError::OutOfRange);
    p.channel_kind = CH_NONE;
    ctx.accounts.raid.raiders[slot as usize].extracted = true;
    let u = &mut ctx.accounts.rpub;
    u.extracted = true;
    u.exposed = true;
    u.pub_x = p.x;
    u.pub_y = p.y;
    Ok(())
}

// ======================= payout math (Option A, DECISIONS #21) =======================

/// floor(Σ units_a × price_a / PRICE_ONE) — dUSD base units at index prices.
pub fn value_of(units: &[u64; NUM_ASSETS], prices: &[u64; NUM_ASSETS]) -> Result<u64> {
    let mut n: u128 = 0;
    for a in 0..NUM_ASSETS {
        n = n.checked_add((units[a] as u128).checked_mul(prices[a] as u128).ok_or(RazkynError::Overflow)?).ok_or(RazkynError::Overflow)?;
    }
    u64::try_from(n / PRICE_ONE as u128).map_err(|_| error!(RazkynError::Overflow))
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Payouts {
    pub raiders: [RaiderResult; MAX_RAIDERS],
    pub stakes_total: u64,
    pub ops: u64,
    pub loot_pool: u64,
    pub extracted_value: u64,
    pub scaled: bool,
    pub leftover: u64,
    pub reserve_total: u64,
    pub dusd_total: u64,
}

/// Pure settlement math. Extracted backpacks are paid in units valued at final prices; if
/// their value exceeds the loot pool they are scaled to fit (floor). The rest of the pool is
/// shared pro rata by stake; dust goes to the lowest joined slot. Asserts
/// `dusd_total + reserve_total + ops == stakes_total` (the conservation invariant).
/// Heap-allocated and out of line: the 4 KB SBF stack cannot hold Payouts plus end_raid's frame.
#[inline(never)]
pub fn compute_payouts(
    raiders: &[RaiderSlot; MAX_RAIDERS],
    backpacks: &[[u64; NUM_ASSETS]; MAX_RAIDERS],
    prices: &[u64; NUM_ASSETS],
) -> Result<Box<Payouts>> {
    let mut out = Box::new(Payouts::default());
    let mut n_joined = 0u64;
    for (i, r) in raiders.iter().enumerate() {
        if !r.joined {
            continue;
        }
        n_joined += 1;
        out.stakes_total = out.stakes_total.checked_add(r.stake).ok_or(RazkynError::Overflow)?;
        out.raiders[i] = RaiderResult {
            wallet: r.wallet, joined: true, extracted: r.extracted, alive: r.alive,
            backpack: backpacks[i], ..Default::default()
        };
    }
    out.ops = OPS_FEE.checked_mul(n_joined).ok_or(RazkynError::Overflow)?;
    out.loot_pool = LOOT_POOL.checked_mul(n_joined).ok_or(RazkynError::Overflow)?;
    let protected_total = PROTECTED.checked_mul(n_joined).ok_or(RazkynError::Overflow)?;
    require!(protected_total + out.loot_pool + out.ops == out.stakes_total, RazkynError::Conservation);

    // Exact numerators (units × index) avoid rounding pushing the paid total over the pool.
    let mut num = [0u128; MAX_RAIDERS];
    let mut total_num: u128 = 0;
    for i in 0..MAX_RAIDERS {
        if out.raiders[i].joined && out.raiders[i].extracted {
            for a in 0..NUM_ASSETS {
                num[i] += backpacks[i][a] as u128 * prices[a] as u128;
            }
            total_num = total_num.checked_add(num[i]).ok_or(RazkynError::Overflow)?;
        }
    }
    out.extracted_value = u64::try_from(total_num / PRICE_ONE as u128).map_err(|_| error!(RazkynError::Overflow))?;
    let pool_num = out.loot_pool as u128 * PRICE_ONE as u128;
    out.scaled = total_num > pool_num;
    let mut paid = 0u64;
    for i in 0..MAX_RAIDERS {
        let r = &mut out.raiders[i];
        if !(r.joined && r.extracted) {
            continue;
        }
        for a in 0..NUM_ASSETS {
            r.mint_units[a] = if out.scaled {
                u64::try_from(backpacks[i][a] as u128 * pool_num / total_num).map_err(|_| error!(RazkynError::Overflow))?
            } else {
                backpacks[i][a]
            };
        }
        r.mint_value = value_of(&r.mint_units, prices)?;
        paid = paid.checked_add(r.mint_value).ok_or(RazkynError::Overflow)?;
    }
    out.reserve_total = paid;
    out.leftover = out.loot_pool.checked_sub(paid).ok_or(RazkynError::Conservation)?;
    let mut shared = 0u64;
    let mut first: Option<usize> = None;
    for i in 0..MAX_RAIDERS {
        if !out.raiders[i].joined {
            continue;
        }
        first.get_or_insert(i);
        let share = u64::try_from(out.leftover as u128 * raiders[i].stake as u128 / out.stakes_total as u128)
            .map_err(|_| error!(RazkynError::Overflow))?;
        shared += share;
        out.raiders[i].dusd_payout = PROTECTED.checked_add(share).ok_or(RazkynError::Overflow)?;
    }
    if let Some(f) = first {
        out.raiders[f].dusd_payout += out.leftover - shared; // rounding dust
    }
    out.dusd_total = out.raiders.iter().map(|r| r.dusd_payout).sum();
    require!(
        out.dusd_total.checked_add(out.reserve_total).and_then(|x| x.checked_add(out.ops)) == Some(out.stakes_total),
        RazkynError::Conservation
    );
    Ok(out)
}

// ======================= end_raid (TEE, anyone) =======================

#[commit]
#[derive(Accounts)]
pub struct EndRaid<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(mut, seeds = [RESULTS_SEED, &raid.raid_id.to_le_bytes()], bump = results.bump)]
    pub results: Box<Account<'info, Results>>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(seeds = [DISTRICT_SEED, &raid.raid_id.to_le_bytes(), &[0]], bump = district0.bump)]
    pub district0: Box<Account<'info, District>>,
    #[account(seeds = [DISTRICT_SEED, &raid.raid_id.to_le_bytes(), &[1]], bump = district1.bump)]
    pub district1: Box<Account<'info, District>>,
    #[account(seeds = [DISTRICT_SEED, &raid.raid_id.to_le_bytes(), &[2]], bump = district2.bump)]
    pub district2: Box<Account<'info, District>>,
    /// CHECK: destination program of the post-commit action.
    #[account(address = crate::ID)]
    pub program_id: UncheckedAccount<'info>,
    // remaining_accounts: RaiderPrivate for each joined slot, in slot order (read).
}

#[inline(never)]
fn results_hash(r: &Results) -> Result<[u8; 32]> {
    let mut copy = Box::new(r.clone());
    copy.results_hash = [0; 32];
    let mut bytes = Vec::new();
    (*copy).serialize(&mut bytes)?;
    Ok(solana_sha256_hasher::hashv(&[&bytes]).to_bytes())
}

/// After 300 s (or when every raider is dead or extracted): freeze state, compute Results
/// (conservation asserted), then commit-and-undelegate Raid + Results with one post-commit
/// action → finalize_raid on base. The action is signed by the Raid PDA (escrow authority),
/// which finalize_raid checks.
pub fn end_raid<'info>(ctx: Context<'info, EndRaid<'info>>) -> Result<()> {
    let clock = Clock::get()?;
    let raid = &mut ctx.accounts.raid;
    let all_done = raid.raiders.iter().filter(|r| r.joined).all(|r| !r.alive || r.extracted);
    if raid.status == status::LIVE && (clock.unix_timestamp >= raid.end_ts || all_done) {
        raid.status = status::ENDED;
    }
    require!(raid.status == status::ENDED, RazkynError::NotEnded);
    require!(!ctx.accounts.results.computed, RazkynError::AlreadyComputed);

    let id = raid.raid_id.to_le_bytes();
    let mut backpacks = [[0u64; NUM_ASSETS]; MAX_RAIDERS];
    let mut k = 0usize;
    for (i, r) in raid.raiders.iter().enumerate() {
        if !r.joined {
            continue;
        }
        let info = ctx.remaining_accounts.get(k).ok_or(RazkynError::BadAccount)?;
        k += 1;
        let p: RaiderPrivate = load(info)?;
        check_pda(info, &[RPRV_SEED, &id, &[i as u8]], p.bump)?;
        backpacks[i] = p.backpack;
    }
    // A district that never received a valid price (Live feed always stale) never moved from
    // its start: value it at 100.0000, so minted units are always backed.
    let fix = |p: u64| if p == 0 { PRICE_ONE } else { p };
    let prices = [
        fix(ctx.accounts.district0.current_price),
        fix(ctx.accounts.district1.current_price),
        fix(ctx.accounts.district2.current_price),
    ];
    let pay = compute_payouts(&raid.raiders, &backpacks, &prices)?;
    let res = &mut ctx.accounts.results;
    res.raid_id = raid.raid_id;
    res.computed = true;
    res.ended_ts = clock.unix_timestamp;
    res.final_prices = prices;
    res.stakes_total = pay.stakes_total;
    res.ops = pay.ops;
    res.loot_pool = pay.loot_pool;
    res.extracted_value = pay.extracted_value;
    res.scaled = pay.scaled;
    res.leftover = pay.leftover;
    res.reserve_total = pay.reserve_total;
    res.dusd_total = pay.dusd_total;
    res.raiders = pay.raiders;
    res.results_hash = results_hash(res)?;
    msg!("end_raid: stakes={} ops={} reserve={} dusd={} scaled={}", pay.stakes_total, pay.ops, pay.reserve_total, pay.dusd_total, pay.scaled);

    // The commit snapshots account data when it is scheduled: write Raid/Results back first.
    ctx.accounts.raid.exit(&crate::ID)?;
    ctx.accounts.results.exit(&crate::ID)?;

    let raid_key = ctx.accounts.raid.key();
    let cfg = &ctx.accounts.config;
    let vault_auth = Pubkey::find_program_address(&[ESCROW_SEED, &id], &crate::ID).0;
    let reserve_auth = Pubkey::find_program_address(&[RESERVE_SEED, &id], &crate::ID).0;
    let ata = |owner: &Pubkey| get_associated_token_address_with_program_id(owner, &cfg.dusd_mint, &cfg.token_program);
    let meta = |k: Pubkey, w: bool| ShortAccountMeta { pubkey: k.to_bytes().into(), is_writable: w };
    let action = CallHandler {
        destination_program: crate::ID,
        accounts: vec![
            meta(Pubkey::find_program_address(&[SETTLE_SEED, &id], &crate::ID).0, true),
            meta(raid_key, false),
            meta(ctx.accounts.results.key(), false),
            meta(cfg.key(), false),
            meta(Pubkey::find_program_address(&[TEST_FLAGS_SEED], &crate::ID).0, false),
            meta(vault_auth, false),
            meta(ata(&vault_auth), true),
            meta(ata(&cfg.ops_treasury), true),
            meta(ata(&reserve_auth), true),
            meta(cfg.dusd_mint, false),
            meta(cfg.token_program, false),
        ],
        args: ActionArgs::new(anchor_lang::InstructionData::data(&crate::instruction::FinalizeRaid {})),
        // The live 1.x validator requires the action's escrow authority to sign the transaction
        // ("BaseAction: authority pubkey must sign transaction", devnet M4), so it is the caller.
        // It must not be a committed account (Raid as authority was committed but not
        // undelegated, MagicSVM M4). finalize_raid authenticates the path, not the caller.
        escrow_authority: ctx.accounts.payer.to_account_info(),
        compute_units: 300_000,
    };
    MagicIntentBundleBuilder::new(
        ctx.accounts.payer.to_account_info(),
        ctx.accounts.magic_context.to_account_info(),
        ctx.accounts.magic_program.to_account_info(),
    )
    .commit_and_undelegate(&[ctx.accounts.raid.to_account_info(), ctx.accounts.results.to_account_info()])
    .add_post_commit_actions([action])
    .build_and_invoke()?;
    Ok(())
}

// ======================= reveal_after_end (TEE, anyone) =======================

#[derive(Accounts)]
pub struct RevealAfterEnd<'info> {
    #[account(seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump)]
    pub raid: Box<Account<'info, Raid>>,
    /// CHECK: Permission Program.
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
    /// CHECK: ephemeral vault.
    #[account(mut, address = EPHEMERAL_VAULT_ID)]
    pub ephemeral_vault: UncheckedAccount<'info>,
    /// CHECK: Magic Program.
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
    // remaining_accounts: (account, its permission) pairs for each item.
}

/// After the raid ends, make sealed crates (item < 36) and backpacks (item = 100 + slot) public
/// (CLAUDE.md §6.3 end_raid). Permissionless; skips accounts that are already public.
pub fn reveal_after_end<'info>(ctx: Context<'info, RevealAfterEnd<'info>>, items: Vec<u8>) -> Result<()> {
    let raid = &ctx.accounts.raid;
    require!(raid.status == status::ENDED, RazkynError::NotEnded);
    let id = raid.raid_id.to_le_bytes();
    for (k, item) in items.iter().enumerate() {
        let info = ctx.remaining_accounts.get(2 * k).ok_or(RazkynError::BadAccount)?;
        let perm = ctx.remaining_accounts.get(2 * k + 1).ok_or(RazkynError::BadAccount)?;
        require_keys_eq!(*perm.key, EphemeralPermission::find_pda(info.key).0, RazkynError::BadAccount);
        if perm.data_is_empty() {
            continue;
        }
        let (seed, idx, bump) = if (*item as usize) < NUM_CRATES {
            let c: Crate = load(info)?;
            check_pda(info, &[CRATE_SEED, &id, &[*item]], c.bump)?;
            (CRATE_SEED, *item, c.bump)
        } else {
            let slot = item.checked_sub(100).ok_or(RazkynError::BadAccount)?;
            let p: RaiderPrivate = load(info)?;
            check_pda(info, &[RPRV_SEED, &id, &[slot]], p.bump)?;
            (RPRV_SEED, slot, p.bump)
        };
        UpdateEphemeralPermissionCpi {
            payer: info.clone(),
            permissioned_account: info.clone(),
            permission: perm.clone(),
            vault: ctx.accounts.ephemeral_vault.to_account_info(),
            magic_program: ctx.accounts.magic_program.to_account_info(),
            permission_program: ctx.accounts.permission_program.to_account_info(),
            authority: info.clone(),
            authority_is_signer: false,
            args: EphemeralMembersArgs { is_private: false, members: vec![] },
        }
        .invoke_signed(&[&[seed, &id, &[idx], &[bump]]])?;
    }
    Ok(())
}

// ======================= settlement on base =======================

/// Accounts shared by finalize_raid and settle_stuck_raid (same order as end_raid's action).
#[derive(Accounts)]
pub struct SettleAccounts<'info> {
    #[account(mut, seeds = [SETTLE_SEED, &settlement.raid_id.to_le_bytes()], bump = settlement.bump)]
    pub settlement: Box<Account<'info, Settlement>>,
    /// CHECK: Raid PDA; owned by the Delegation Program while the commit is finalizing.
    #[account(seeds = [RAID_SEED, &settlement.raid_id.to_le_bytes()], bump)]
    pub raid: UncheckedAccount<'info>,
    /// CHECK: committed Results; decoded and checked in settle_core.
    #[account(seeds = [RESULTS_SEED, &settlement.raid_id.to_le_bytes()], bump)]
    pub results: UncheckedAccount<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    /// CHECK: optional TestFlags PDA (may not exist).
    #[account(seeds = [TEST_FLAGS_SEED], bump)]
    pub test_flags: UncheckedAccount<'info>,
    /// CHECK: stake vault authority PDA ["escrow", raid_id].
    #[account(seeds = [ESCROW_SEED, &settlement.raid_id.to_le_bytes()], bump)]
    pub vault_auth: UncheckedAccount<'info>,
    #[account(mut, associated_token::mint = dusd_mint, associated_token::authority = vault_auth, associated_token::token_program = token_program)]
    pub stake_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, associated_token::mint = dusd_mint, associated_token::authority = config.ops_treasury, associated_token::token_program = token_program)]
    pub treasury: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = dusd_mint, token::token_program = token_program)]
    pub reserve: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = config.dusd_mint)]
    pub dusd_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = config.token_program)]
    pub token_program: Interface<'info, TokenInterface>,
}

/// Read committed Results from raw data (owner may still be the Delegation Program).
pub fn read_results(info: &AccountInfo, raid_id: u64) -> Result<Results> {
    let r: Results = load(info)?;
    require!(r.raid_id == raid_id && r.computed, RazkynError::NotCommitted);
    require!(results_hash(&r)? == r.results_hash, RazkynError::NotCommitted);
    Ok(r)
}

fn settle_core(a: &mut SettleAccounts, via: u8) -> Result<()> {
    let raid_id = a.settlement.raid_id;
    require!(!a.settlement.settled, RazkynError::AlreadySettled);
    let r = read_results(&a.results.to_account_info(), raid_id)?;
    let id = raid_id.to_le_bytes();
    let reserve_auth = Pubkey::find_program_address(&[RESERVE_SEED, &id], &crate::ID).0;
    require_keys_eq!(a.reserve.owner, reserve_auth, RazkynError::BadAccount);
    require!(a.stake_vault.amount >= r.stakes_total, RazkynError::Conservation);
    let bump = Pubkey::find_program_address(&[ESCROW_SEED, &id], &crate::ID).1;
    let seeds: &[&[u8]] = &[ESCROW_SEED, &id, &[bump]];
    for (to, amount) in [(&a.treasury, r.ops), (&a.reserve, r.reserve_total)] {
        if amount == 0 {
            continue;
        }
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                a.token_program.key(),
                TransferChecked {
                    from: a.stake_vault.to_account_info(),
                    mint: a.dusd_mint.to_account_info(),
                    to: to.to_account_info(),
                    authority: a.vault_auth.to_account_info(),
                },
                &[seeds],
            ),
            amount,
            DUSD_DECIMALS,
        )?;
    }
    let s = &mut a.settlement;
    s.settled = true;
    s.settled_via = via;
    s.results_hash = r.results_hash;
    msg!("settled raid {} via {}: ops={} reserve={}", raid_id, via, r.ops, r.reserve_total);
    Ok(())
}

#[action]
#[derive(Accounts)]
pub struct FinalizeRaid<'info> {
    pub settle: SettleAccounts<'info>,
    /// CHECK: program that scheduled the action, passed by DLP CallHandlerV2. Together with the
    /// escrow signer below (only the Delegation Program can produce it), this proves the call is
    /// a post-commit action scheduled by this program, i.e. by end_raid. The outcome does not
    /// depend on who called end_raid: settlement re-reads the committed, hash-checked Results.
    #[account(address = crate::ID @ RazkynError::Unauthorized)]
    pub source_program: UncheckedAccount<'info>,
    /// CHECK: escrow authority the action was scheduled with (end_raid's caller).
    pub escrow_auth: UncheckedAccount<'info>,
    /// CHECK: only the Delegation Program can sign for this PDA, which proves the call came
    /// through the real post-commit path (skill magic-actions.md).
    #[account(
        signer @ RazkynError::Unauthorized,
        address = ephemeral_rollups_sdk::pda::ephemeral_balance_pda_from_payer(&escrow_auth.key(), ACTION_ESCROW_INDEX) @ RazkynError::Unauthorized,
    )]
    pub escrow: UncheckedAccount<'info>,
}

/// Post-commit Magic Action. Idempotent (fails once settled). Honors TestFlags.fail_finalize
/// so devnet test 11 can force the committor to drop it.
pub fn finalize_raid(ctx: Context<FinalizeRaid>) -> Result<()> {
    let tf = &ctx.accounts.settle.test_flags;
    if tf.owner == &crate::ID && !tf.data_is_empty() {
        let flags: TestFlags = load(&tf.to_account_info())?;
        require!(!flags.fail_finalize, RazkynError::ForcedFailure);
    }
    settle_core(&mut ctx.accounts.settle, 1)
}

#[derive(Accounts)]
pub struct SettleStuckRaid<'info> {
    pub settle: SettleAccounts<'info>,
    pub payer: Signer<'info>,
}

/// Permissionless recovery when the commit landed but finalize_raid did not (the committor
/// drops failed actions, M0/S5): ≥ 120 s after the raid ended and Raid back under this program.
pub fn settle_stuck_raid(ctx: Context<SettleStuckRaid>) -> Result<()> {
    require!(ctx.accounts.settle.raid.owner == &crate::ID, RazkynError::NotCommitted);
    let r = read_results(&ctx.accounts.settle.results.to_account_info(), ctx.accounts.settle.settlement.raid_id)?;
    require!(Clock::get()?.unix_timestamp >= r.ended_ts.saturating_add(SETTLE_STUCK_SECS), RazkynError::TooEarly);
    settle_core(&mut ctx.accounts.settle, 2)
}

// ======================= claim (base, permissionless) =======================

#[derive(Accounts)]
#[instruction(slot: u8)]
pub struct Claim<'info> {
    #[account(mut, seeds = [SETTLE_SEED, &settlement.raid_id.to_le_bytes()], bump = settlement.bump)]
    pub settlement: Box<Account<'info, Settlement>>,
    /// CHECK: committed Results (decoded in the handler).
    #[account(seeds = [RESULTS_SEED, &settlement.raid_id.to_le_bytes()], bump)]
    pub results: UncheckedAccount<'info>,
    #[account(init, payer = payer, space = 8 + ClaimRecord::INIT_SPACE, seeds = [CLAIM_SEED, &settlement.raid_id.to_le_bytes(), &[slot]], bump)]
    pub claim_record: Box<Account<'info, ClaimRecord>>,
    /// CHECK: payout wallet; must equal Results.raiders[slot].wallet.
    pub wallet: UncheckedAccount<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    /// CHECK: stake vault authority PDA.
    #[account(seeds = [ESCROW_SEED, &settlement.raid_id.to_le_bytes()], bump)]
    pub vault_auth: UncheckedAccount<'info>,
    #[account(mut, associated_token::mint = dusd_mint, associated_token::authority = vault_auth, associated_token::token_program = token_program)]
    pub stake_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(init_if_needed, payer = payer, associated_token::mint = dusd_mint, associated_token::authority = wallet, associated_token::token_program = token_program)]
    pub wallet_dusd: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: mint authority PDA.
    #[account(seeds = [MINT_AUTH_SEED], bump = config.mint_auth_bump)]
    pub mint_auth: UncheckedAccount<'info>,
    #[account(mut, address = config.asset_mints[0])]
    pub twr_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = config.asset_mints[1])]
    pub fac_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, address = config.asset_mints[2])]
    pub hrb_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(init_if_needed, payer = payer, associated_token::mint = twr_mint, associated_token::authority = wallet, associated_token::token_program = token_program)]
    pub wallet_twr: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(init_if_needed, payer = payer, associated_token::mint = fac_mint, associated_token::authority = wallet, associated_token::token_program = token_program)]
    pub wallet_fac: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(init_if_needed, payer = payer, associated_token::mint = hrb_mint, associated_token::authority = wallet, associated_token::token_program = token_program)]
    pub wallet_hrb: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(address = config.dusd_mint)]
    pub dusd_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(address = config.token_program)]
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Pays the protected slot + pro-rata share in dUSD from the stake vault and mints the
/// (scaled) backpack units as dTWR/dFAC/dHRB, backed by the dUSD moved to the reserve at
/// settlement. Requires settled; the ClaimRecord `init` makes a second claim fail.
pub fn claim(ctx: Context<Claim>, slot: u8) -> Result<()> {
    require!(ctx.accounts.settlement.settled, RazkynError::NotSettled);
    require!((slot as usize) < MAX_RAIDERS, RazkynError::BadSlot);
    let raid_id = ctx.accounts.settlement.raid_id;
    let r = read_results(&ctx.accounts.results.to_account_info(), raid_id)?;
    require!(r.results_hash == ctx.accounts.settlement.results_hash, RazkynError::NotCommitted);
    let rr = r.raiders[slot as usize];
    require!(rr.joined, RazkynError::SlotNotJoined);
    require_keys_eq!(ctx.accounts.wallet.key(), rr.wallet, RazkynError::Unauthorized);

    let s = &mut ctx.accounts.settlement;
    s.dusd_paid = s.dusd_paid.checked_add(rr.dusd_payout).ok_or(RazkynError::Overflow)?;
    s.units_minted_value = s.units_minted_value.checked_add(rr.mint_value).ok_or(RazkynError::Overflow)?;
    s.claims = s.claims.saturating_add(1);
    // Conservation in claim: never pay out more than settlement accounted for.
    require!(s.dusd_paid <= r.dusd_total && s.units_minted_value <= r.reserve_total, RazkynError::Conservation);

    let id = raid_id.to_le_bytes();
    let vbump = ctx.bumps.vault_auth;
    let tp = ctx.accounts.token_program.key();
    if rr.dusd_payout > 0 {
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                tp,
                TransferChecked {
                    from: ctx.accounts.stake_vault.to_account_info(),
                    mint: ctx.accounts.dusd_mint.to_account_info(),
                    to: ctx.accounts.wallet_dusd.to_account_info(),
                    authority: ctx.accounts.vault_auth.to_account_info(),
                },
                &[&[ESCROW_SEED, &id, &[vbump]]],
            ),
            rr.dusd_payout,
            DUSD_DECIMALS,
        )?;
    }
    let mseeds: &[&[u8]] = &[MINT_AUTH_SEED, &[ctx.accounts.config.mint_auth_bump]];
    let pairs = [
        (&ctx.accounts.twr_mint, &ctx.accounts.wallet_twr),
        (&ctx.accounts.fac_mint, &ctx.accounts.wallet_fac),
        (&ctx.accounts.hrb_mint, &ctx.accounts.wallet_hrb),
    ];
    for (a, (mint, to)) in pairs.into_iter().enumerate() {
        if rr.mint_units[a] == 0 {
            continue;
        }
        token_interface::mint_to(
            CpiContext::new_with_signer(
                tp,
                MintTo { mint: mint.to_account_info(), to: to.to_account_info(), authority: ctx.accounts.mint_auth.to_account_info() },
                &[mseeds],
            ),
            rr.mint_units[a],
        )?;
    }
    let c = &mut ctx.accounts.claim_record;
    c.raid_id = raid_id;
    c.slot = slot;
    c.claimed = true;
    c.bump = ctx.bumps.claim_record;
    Ok(())
}

// ======================= report hash + test flags =======================

#[derive(Accounts)]
pub struct PostReportHash<'info> {
    #[account(mut, seeds = [SETTLE_SEED, &settlement.raid_id.to_le_bytes()], bump = settlement.bump)]
    pub settlement: Box<Account<'info, Settlement>>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = keeper @ RazkynError::Unauthorized)]
    pub config: Box<Account<'info, Config>>,
    pub keeper: Signer<'info>,
}

/// Keeper, base, once: store the Market Raid Report hash (CLAUDE.md §8).
pub fn post_report_hash(ctx: Context<PostReportHash>, hash: [u8; 32]) -> Result<()> {
    let s = &mut ctx.accounts.settlement;
    require!(s.settled, RazkynError::NotSettled);
    require!(!s.report_posted, RazkynError::AlreadySettled);
    s.report_hash = hash;
    s.report_posted = true;
    Ok(())
}

/// `["test_flags"]`, base, admin-set. Only used by devnet test 11. Size: 8 + 2.
#[account]
#[derive(InitSpace)]
pub struct TestFlags {
    pub fail_finalize: bool,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct SetTestFlags<'info> {
    #[account(init_if_needed, payer = admin, space = 8 + TestFlags::INIT_SPACE, seeds = [TEST_FLAGS_SEED], bump)]
    pub test_flags: Account<'info, TestFlags>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ RazkynError::Unauthorized)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn set_test_flags(ctx: Context<SetTestFlags>, fail_finalize: bool) -> Result<()> {
    ctx.accounts.test_flags.fail_finalize = fail_finalize;
    ctx.accounts.test_flags.bump = ctx.bumps.test_flags;
    Ok(())
}
