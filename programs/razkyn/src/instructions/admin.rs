//! init_config, faucet_dusd, faucet_play (base layer).
use crate::constants::*;
use crate::errors::RazkynError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{self, Mint, MintTo, TokenAccount, TokenInterface};

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    /// CHECK: mint authority PDA; owns no data.
    #[account(seeds = [MINT_AUTH_SEED], bump)]
    pub mint_auth: UncheckedAccount<'info>,
    #[account(mint::authority = mint_auth, mint::decimals = DUSD_DECIMALS, mint::token_program = token_program)]
    pub dusd_mint: InterfaceAccount<'info, Mint>,
    #[account(mint::authority = mint_auth, mint::decimals = DUSD_DECIMALS, mint::token_program = token_program)]
    pub twr_mint: InterfaceAccount<'info, Mint>,
    #[account(mint::authority = mint_auth, mint::decimals = DUSD_DECIMALS, mint::token_program = token_program)]
    pub fac_mint: InterfaceAccount<'info, Mint>,
    #[account(mint::authority = mint_auth, mint::decimals = DUSD_DECIMALS, mint::token_program = token_program)]
    pub hrb_mint: InterfaceAccount<'info, Mint>,
    #[account(mint::authority = mint_auth, mint::decimals = 0, mint::token_program = token_program)]
    pub play_mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn init_config(ctx: Context<InitConfig>, keeper: Pubkey, ops_treasury: Pubkey) -> Result<()> {
    let c = &mut ctx.accounts.config;
    c.admin = ctx.accounts.admin.key();
    c.keeper = keeper;
    c.dusd_mint = ctx.accounts.dusd_mint.key();
    c.asset_mints = [
        ctx.accounts.twr_mint.key(),
        ctx.accounts.fac_mint.key(),
        ctx.accounts.hrb_mint.key(),
    ];
    c.play_mint = ctx.accounts.play_mint.key();
    c.ops_treasury = ops_treasury;
    c.token_program = ctx.accounts.token_program.key();
    c.bump = ctx.bumps.config;
    c.mint_auth_bump = ctx.bumps.mint_auth;
    Ok(())
}

#[derive(Accounts)]
pub struct Faucet<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init_if_needed, payer = user, space = 8 + FaucetLedger::INIT_SPACE,
        seeds = [FAUCET_SEED, user.key().as_ref()], bump
    )]
    pub ledger: Account<'info, FaucetLedger>,
    /// CHECK: mint authority PDA.
    #[account(seeds = [MINT_AUTH_SEED], bump = config.mint_auth_bump)]
    pub mint_auth: UncheckedAccount<'info>,
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init_if_needed, payer = user,
        associated_token::mint = mint, associated_token::authority = user,
        associated_token::token_program = token_program
    )]
    pub user_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(address = config.token_program)]
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

fn mint_from_faucet(ctx: &Context<Faucet>, amount: u64) -> Result<()> {
    let seeds: &[&[u8]] = &[MINT_AUTH_SEED, &[ctx.accounts.config.mint_auth_bump]];
    token_interface::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.user_ata.to_account_info(),
                authority: ctx.accounts.mint_auth.to_account_info(),
            },
            &[seeds],
        ),
        amount,
    )
}

/// dUSD faucet, capped at 100 dUSD per wallet per UTC day.
pub fn faucet_dusd(ctx: Context<Faucet>, amount: u64) -> Result<()> {
    require_keys_eq!(ctx.accounts.mint.key(), ctx.accounts.config.dusd_mint, RazkynError::BadMint);
    let day = Clock::get()?.unix_timestamp / SECS_PER_DAY;
    let l = &mut ctx.accounts.ledger;
    if l.wallet == Pubkey::default() {
        l.wallet = ctx.accounts.user.key();
        l.bump = ctx.bumps.ledger;
    }
    if l.day != day {
        l.day = day;
        l.dusd_today = 0;
    }
    let after = l.dusd_today.checked_add(amount).ok_or(RazkynError::Overflow)?;
    require!(after <= FAUCET_DUSD_DAILY_CAP, RazkynError::FaucetCap);
    l.dusd_today = after;
    l.dusd_total = l.dusd_total.checked_add(amount).ok_or(RazkynError::Overflow)?;
    mint_from_faucet(&ctx, amount)
}

/// dPLAY faucet (spectator play-money, free).
pub fn faucet_play(ctx: Context<Faucet>, amount: u64) -> Result<()> {
    require_keys_eq!(ctx.accounts.mint.key(), ctx.accounts.config.play_mint, RazkynError::BadMint);
    let l = &mut ctx.accounts.ledger;
    if l.wallet == Pubkey::default() {
        l.wallet = ctx.accounts.user.key();
        l.bump = ctx.bumps.ledger;
    }
    mint_from_faucet(&ctx, amount)
}
