use anchor_lang::prelude::*;

#[error_code]
pub enum RazkynError {
    #[msg("arithmetic overflow")]
    Overflow,
    #[msg("signer is not authorized for this action")]
    Unauthorized,
    #[msg("raid is not in the required status")]
    BadStatus,
    #[msg("slot index out of range")]
    BadSlot,
    #[msg("slot already taken")]
    SlotTaken,
    #[msg("wallet already joined this raid")]
    AlreadyJoined,
    #[msg("raid key is invalid or reused")]
    BadRaidKey,
    #[msg("slot is not joined")]
    SlotNotJoined,
    #[msg("not enough raiders")]
    NotEnoughRaiders,
    #[msg("signer is not the registered raid key for this slot")]
    WrongRaidKey,
    #[msg("raider is dead")]
    RaiderDead,
    #[msg("raider has extracted")]
    RaiderExtracted,
    #[msg("raid time is over")]
    RaidOver,
    #[msg("move exceeds the speed limit")]
    TooFast,
    #[msg("move leaves the map")]
    OutOfBounds,
    #[msg("faucet daily cap reached")]
    FaucetCap,
    #[msg("permissions are not set up")]
    PermissionsMissing,
    #[msg("a VRF request is already pending")]
    VrfPending,
    #[msg("VRF callback does not match the pending request")]
    VrfMismatch,
    #[msg("raid is not seeded yet")]
    NotSeeded,
    #[msg("account does not match the expected PDA")]
    BadAccount,
    #[msg("too many permission members")]
    TooManyMembers,
    #[msg("bad mint")]
    BadMint,
    #[msg("bad mode")]
    BadMode,
    #[msg("crate is not placed or already opened")]
    CrateNotOpenable,
    #[msg("crate is dormant until its district wakes")]
    CrateDormant,
    #[msg("out of range")]
    OutOfRange,
    #[msg("no matching channel in progress")]
    NoChannel,
    #[msg("channel not finished yet")]
    ChannelNotDone,
    #[msg("bad target")]
    BadTarget,
    #[msg("weapon cooling down")]
    Cooldown,
    #[msg("crates are not all placed")]
    CratesNotPlaced,
    #[msg("bad slice chunk")]
    BadChunk,
    #[msg("slice not fully loaded")]
    SliceNotLoaded,
    #[msg("slice or Merkle proof does not match the committed day root")]
    BadProof,
    #[msg("mystery slice not verified")]
    SliceNotVerified,
    #[msg("not at a trading terminal")]
    NotAtTerminal,
    #[msg("action blocked while trading")]
    Trading,
    #[msg("bad trade")]
    BadTrade,
    #[msg("not enough units")]
    InsufficientUnits,
    #[msg("bad price feed")]
    BadFeed,
    #[msg("no open exit there")]
    ExitClosed,
    #[msg("raid has not ended")]
    NotEnded,
    #[msg("results already computed")]
    AlreadyComputed,
    #[msg("conservation check failed")]
    Conservation,
    #[msg("raid is not settled")]
    NotSettled,
    #[msg("raid already settled")]
    AlreadySettled,
    #[msg("already claimed")]
    AlreadyClaimed,
    #[msg("too early for settle_stuck_raid")]
    TooEarly,
    #[msg("results not committed to base yet")]
    NotCommitted,
    #[msg("forced finalize failure (test flag)")]
    ForcedFailure,
}
