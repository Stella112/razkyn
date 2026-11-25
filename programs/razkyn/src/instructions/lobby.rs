//! Base-layer lobby: create_raid (+ create_slot, create_districts), join_raid, delegate_pda.
//! `create_raid` is split into three instructions because one transaction cannot create every
//! raid account (size and account limits); see DECISIONS.md.
use crate::constants::*;
use crate::errors::RazkynError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
use ephemeral_rollups_sdk::access_control::structs::EphemeralPermission;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephemeral_accounts::rent as permission_rent;

fn prefund<'info>(
    from: &Signer<'info>,
    to: AccountInfo<'info>,
    system_program: &Program<'info, System>,
    members: usize,
) -> Result<()> {
    transfer(
        CpiContext::new(
            system_program.key(),
            Transfer { from: from.to_account_info(), to },
        ),
        permission_rent(EphemeralPermission::size_of(members) as u32),
    )
}

// ---------------- create_raid ----------------

#[derive(Accounts)]
#[instruction(raid_id: u64)]
pub struct CreateRaid<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = keeper @ RazkynError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(init, payer = keeper, space = 8 + Raid::INIT_SPACE, seeds = [RAID_SEED, &raid_id.to_le_bytes()], bump)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(init, payer = keeper, space = 8 + std::mem::size_of::<RaidSecret>(), seeds = [SECRET_SEED, &raid_id.to_le_bytes()], bump)]
    pub secret: AccountLoader<'info, RaidSecret>,
    /// CHECK: escrow authority PDA (holds no data). Base only, never delegated.
    #[account(seeds = [ESCROW_SEED, &raid_id.to_le_bytes()], bump)]
    pub escrow_auth: UncheckedAccount<'info>,
    #[account(
        init, payer = keeper,
        associated_token::mint = dusd_mint, associated_token::authority = escrow_auth,
        associated_token::token_program = token_program
    )]
    pub escrow: InterfaceAccount<'info, TokenAccount>,
    #[account(address = config.dusd_mint)]
    pub dusd_mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub keeper: Signer<'info>,
    #[account(address = config.token_program)]
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn create_raid(
    ctx: Context<CreateRaid>,
    raid_id: u64,
    mode: u8,
    leaf_count: u32,
    day_root: [u8; 32],
    event_plan_hash: [u8; 32],
) -> Result<()> {
    require!(mode == mode::MYSTERY || mode == mode::LIVE, RazkynError::BadMode);
    require!(mode == mode::LIVE || leaf_count > 0, RazkynError::BadMode);
    prefund(
        &ctx.accounts.keeper,
        ctx.accounts.secret.to_account_info(),
        &ctx.accounts.system_program,
        SECRET_PERMISSION_MEMBERS,
    )?;
    let r = &mut ctx.accounts.raid;
    r.raid_id = raid_id;
    r.keeper = ctx.accounts.keeper.key();
    r.mode = mode;
    r.status = status::LOBBY;
    r.bump = ctx.bumps.raid;
    r.leaf_count = if mode == mode::MYSTERY { leaf_count } else { 0 };
    r.created_ts = Clock::get()?.unix_timestamp;
    r.open_exits = [NO_EXIT; EXITS_PER_WINDOW];
    r.day_root = day_root;
    r.event_plan_hash = event_plan_hash;
    let mut s = ctx.accounts.secret.load_init()?;
    s.raid_id = raid_id;
    s.exit_plan = [NO_EXIT; 8];
    Ok(())
}

// ---------------- create_slot ----------------

#[derive(Accounts)]
#[instruction(slot: u8)]
pub struct CreateSlot<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = keeper @ RazkynError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump, constraint = raid.status == status::LOBBY @ RazkynError::BadStatus)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(init, payer = keeper, space = 8 + RaiderPublic::INIT_SPACE, seeds = [RPUB_SEED, &raid.raid_id.to_le_bytes(), &[slot]], bump)]
    pub rpub: Account<'info, RaiderPublic>,
    #[account(init, payer = keeper, space = 8 + RaiderPrivate::INIT_SPACE, seeds = [RPRV_SEED, &raid.raid_id.to_le_bytes(), &[slot]], bump)]
    pub rprv: Account<'info, RaiderPrivate>,
    #[account(init, payer = keeper, space = 8 + View::INIT_SPACE, seeds = [VIEW_SEED, &raid.raid_id.to_le_bytes(), &[slot]], bump)]
    pub view: Account<'info, View>,
    #[account(mut)]
    pub keeper: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn create_slot(ctx: Context<CreateSlot>, slot: u8) -> Result<()> {
    require!((slot as usize) < MAX_RAIDERS, RazkynError::BadSlot);
    prefund(&ctx.accounts.keeper, ctx.accounts.rprv.to_account_info(), &ctx.accounts.system_program, RPRV_PERMISSION_MEMBERS)?;
    prefund(&ctx.accounts.keeper, ctx.accounts.view.to_account_info(), &ctx.accounts.system_program, VIEW_PERMISSION_MEMBERS)?;
    let raid_id = ctx.accounts.raid.raid_id;
    let p = &mut ctx.accounts.rpub;
    p.raid_id = raid_id;
    p.slot = slot;
    p.hp = MAX_HP;
    p.alive = true;
    p.bump = ctx.bumps.rpub;
    // RaiderPrivate holds no secret yet: position is written on the TEE by the VRF callback.
    let q = &mut ctx.accounts.rprv;
    q.raid_id = raid_id;
    q.slot = slot;
    q.bump = ctx.bumps.rprv;
    let v = &mut ctx.accounts.view;
    v.raid_id = raid_id;
    v.slot = slot;
    v.bump = ctx.bumps.view;
    Ok(())
}

// ---------------- create_districts ----------------

#[derive(Accounts)]
pub struct CreateDistricts<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = keeper @ RazkynError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump, constraint = raid.status == status::LOBBY @ RazkynError::BadStatus)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(init, payer = keeper, space = 8 + District::INIT_SPACE, seeds = [DISTRICT_SEED, &raid.raid_id.to_le_bytes(), &[0]], bump)]
    pub district0: Box<Account<'info, District>>,
    #[account(init, payer = keeper, space = 8 + District::INIT_SPACE, seeds = [DISTRICT_SEED, &raid.raid_id.to_le_bytes(), &[1]], bump)]
    pub district1: Box<Account<'info, District>>,
    #[account(init, payer = keeper, space = 8 + District::INIT_SPACE, seeds = [DISTRICT_SEED, &raid.raid_id.to_le_bytes(), &[2]], bump)]
    pub district2: Box<Account<'info, District>>,
    #[account(mut)]
    pub keeper: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn create_districts(ctx: Context<CreateDistricts>) -> Result<()> {
    let raid_id = ctx.accounts.raid.raid_id;
    let bumps = [ctx.bumps.district0, ctx.bumps.district1, ctx.bumps.district2];
    for (i, d) in [
        &mut ctx.accounts.district0,
        &mut ctx.accounts.district1,
        &mut ctx.accounts.district2,
    ]
    .into_iter()
    .enumerate()
    {
        d.raid_id = raid_id;
        d.index = i as u8;
        d.asset = i as u8;
        d.bump = bumps[i];
    }
    Ok(())
}

// ---------------- join_raid ----------------

#[derive(Accounts)]
#[instruction(slot: u8)]
pub struct JoinRaid<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [RAID_SEED, &raid.raid_id.to_le_bytes()], bump = raid.bump)]
    pub raid: Box<Account<'info, Raid>>,
    #[account(mut, seeds = [RPUB_SEED, &raid.raid_id.to_le_bytes(), &[slot]], bump = rpub.bump)]
    pub rpub: Account<'info, RaiderPublic>,
    #[account(mut, seeds = [RPRV_SEED, &raid.raid_id.to_le_bytes(), &[slot]], bump = rprv.bump)]
    pub rprv: Account<'info, RaiderPrivate>,
    #[account(mut, token::mint = dusd_mint, token::authority = wallet, token::token_program = token_program)]
    pub wallet_ata: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: escrow authority PDA.
    #[account(seeds = [ESCROW_SEED, &raid.raid_id.to_le_bytes()], bump)]
    pub escrow_auth: UncheckedAccount<'info>,
    #[account(
        mut,
        associated_token::mint = dusd_mint, associated_token::authority = escrow_auth,
        associated_token::token_program = token_program
    )]
    pub escrow: InterfaceAccount<'info, TokenAccount>,
    #[account(address = config.dusd_mint)]
    pub dusd_mint: InterfaceAccount<'info, Mint>,
    pub wallet: Signer<'info>,
    /// Present (and signing) only when the keeper registers a labelled BOT.
    pub keeper: Option<Signer<'info>>,
    #[account(address = config.token_program)]
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn join_raid(ctx: Context<JoinRaid>, slot: u8, raid_key: Pubkey) -> Result<()> {
    let wallet = ctx.accounts.wallet.key();
    let is_bot = match &ctx.accounts.keeper {
        Some(k) => {
            require_keys_eq!(k.key(), ctx.accounts.config.keeper, RazkynError::Unauthorized);
            true
        }
        None => false,
    };
    {
        let raid = &ctx.accounts.raid;
        require!(raid.status == status::LOBBY, RazkynError::BadStatus);
        require!((slot as usize) < MAX_RAIDERS, RazkynError::BadSlot);
        require!(!raid.raiders[slot as usize].joined, RazkynError::SlotTaken);
        require!(raid_key != Pubkey::default() && raid_key != wallet, RazkynError::BadRaidKey);
        for r in raid.raiders.iter().filter(|r| r.joined) {
            require_keys_neq!(r.wallet, wallet, RazkynError::AlreadyJoined);
            require!(r.raid_key != raid_key && r.wallet != raid_key, RazkynError::BadRaidKey);
        }
    }
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.wallet_ata.to_account_info(),
                mint: ctx.accounts.dusd_mint.to_account_info(),
                to: ctx.accounts.escrow.to_account_info(),
                authority: ctx.accounts.wallet.to_account_info(),
            },
        ),
        STAKE,
        DUSD_DECIMALS,
    )?;
    let raid = &mut ctx.accounts.raid;
    raid.raiders[slot as usize] = RaiderSlot {
        wallet,
        raid_key,
        stake: STAKE,
        joined: true,
        alive: true,
        extracted: false,
        is_bot,
    };
    raid.joined_count = raid.joined_count.checked_add(1).ok_or(RazkynError::Overflow)?;
    ctx.accounts.rprv.raid_key = raid_key;
    ctx.accounts.rpub.is_bot = is_bot;
    Ok(())
}

// ---------------- delegate_pda ----------------

/// Which raid account to delegate. The escrow is not here: it never leaves the base layer.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub enum RaidAccount {
    Raid,
    Secret,
    District { index: u8 },
    RaiderPublic { slot: u8 },
    RaiderPrivate { slot: u8 },
    View { slot: u8 },
    Crate { idx: u8 },
}

impl RaidAccount {
    pub fn seeds(&self, raid_id: u64) -> Vec<Vec<u8>> {
        let id = raid_id.to_le_bytes().to_vec();
        match *self {
            RaidAccount::Raid => vec![RAID_SEED.to_vec(), id],
            RaidAccount::Secret => vec![SECRET_SEED.to_vec(), id],
            RaidAccount::District { index } => vec![DISTRICT_SEED.to_vec(), id, vec![index]],
            RaidAccount::RaiderPublic { slot } => vec![RPUB_SEED.to_vec(), id, vec![slot]],
            RaidAccount::RaiderPrivate { slot } => vec![RPRV_SEED.to_vec(), id, vec![slot]],
            RaidAccount::View { slot } => vec![VIEW_SEED.to_vec(), id, vec![slot]],
            RaidAccount::Crate { idx } => vec![CRATE_SEED.to_vec(), id, vec![idx]],
        }
    }
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateRaidPda<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = keeper @ RazkynError::Unauthorized)]
    pub config: Box<Account<'info, Config>>,
    /// CHECK: the raid PDA to delegate; its address is checked against the seeds below.
    #[account(mut, del)]
    pub pda: UncheckedAccount<'info>,
    #[account(mut)]
    pub keeper: Signer<'info>,
    /// CHECK: TEE validator identity, forwarded in DelegateConfig.
    pub validator: Option<UncheckedAccount<'info>>,
}

pub fn delegate_pda(ctx: Context<DelegateRaidPda>, raid_id: u64, account: RaidAccount) -> Result<()> {
    let seed_data = account.seeds(raid_id);
    let seed_refs: Vec<&[u8]> = seed_data.iter().map(|s| s.as_slice()).collect();
    let (expected, _) = Pubkey::find_program_address(&seed_refs, &crate::ID);
    require_keys_eq!(ctx.accounts.pda.key(), expected, RazkynError::BadAccount);
    let validator = ctx.accounts.validator.as_ref().map(|v| v.key());
    ctx.accounts.delegate_pda(
        &ctx.accounts.keeper,
        &seed_refs,
        DelegateConfig { validator, ..Default::default() },
    )?;
    Ok(())
}
