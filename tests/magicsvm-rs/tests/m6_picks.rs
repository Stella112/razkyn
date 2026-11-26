// RAZKYN LIVE on-chain picks (DECISIONS #39): program-clock locks, one choice per pick, session keys,
// resolution from public accounts only (incl. a real knockout), credit conservation, cancel refunds,
// VRF streak badge committed to base and claimed once.
mod common;
use common::*;

fn register(w: &mut World, wallet: &Keypair, session: &Keypair) {
    let i = ix(instruction::RegisterSpectator { session: kp(session) }, accounts::RegisterSpectator { book: picks_pda(), raid: raid_pda(), wallet: kp(wallet) });
    w.send(TransactionTarget::Ephemeral, &[wallet], &[i], "register_spectator");
}
fn place(w: &mut World, session: &Keypair, pool: u8, choice: u8, amount: u16) -> SendResult {
    let i = ix(instruction::PlacePick { pool, choice, amount }, accounts::PlacePick { book: picks_pda(), raid: raid_pda(), session: kp(session) });
    w.try_send(TransactionTarget::Ephemeral, &[session], &[i])
}
fn resolve_accounts() -> accounts::ResolvePicks {
    let r = |s: u8| slot_pda(RPUB_SEED, s);
    accounts::ResolvePicks {
        book: picks_pda(), raid: raid_pda(),
        district0: slot_pda(DISTRICT_SEED, 0), district1: slot_pda(DISTRICT_SEED, 1), district2: slot_pda(DISTRICT_SEED, 2),
        rpub0: r(0), rpub1: r(1), rpub2: r(2), rpub3: r(3), rpub4: r(4), rpub5: r(5), rpub6: r(6), rpub7: r(7),
    }
}
fn resolve(w: &mut World) {
    let k = w.rk(2); // anyone may resolve (the crank does it every second on devnet)
    w.send(TransactionTarget::Ephemeral, &[&k], &[ix(instruction::ResolvePicks {}, resolve_accounts())], "resolve_picks");
}
/// Zero-copy account: cast the bytes after the 8-byte discriminator.
fn book_at(w: &World, t: TransactionTarget) -> PickBook {
    let acc = w.svm.get_account_for(t, &a(picks_pda())).expect("pick book");
    *anchor_lang::__private::bytemuck::from_bytes::<PickBook>(&acc.data[8..8 + std::mem::size_of::<PickBook>()])
}
fn book(w: &World) -> PickBook { book_at(w, TransactionTarget::Ephemeral) }
const C0: u8 = 8; // NEXT CRACK window 0
const D0: u8 = 13; // KNOCKOUT window 0

#[test]
fn picks_lock_by_program_clock_one_choice_session_key() {
    let mut w = live_raid(8);
    let (wa, sa) = (Keypair::new(), Keypair::new());
    register(&mut w, &wa, &sa);
    assert_eq!(book(&w).spectators[0].credits, 100, "100 play credits on register");
    place(&mut w, &sa, 0, 0, 10).expect("EXTRACTS(raider 1) YES");
    expect_err(place(&mut w, &sa, 0, 1, 5), E_ALREADY_PICKED, "second choice on the same pool");
    place(&mut w, &sa, C0, 3, 5).expect("NEXT CRACK window 0 within its 10 s");
    expect_err(place(&mut w, &sa, D0 + 1, 0, 5), E_PICKS_CLOSED, "KNOCKOUT window 1 before it opens");
    w.advance_secs(9);
    expect_err(place(&mut w, &sa, D0, 0, 5), E_PICKS_CLOSED, "KNOCKOUT window 0 after its 8 s lock (program clock)");
    expect_err(place(&mut w, &Keypair::new(), C0, 0, 5), E_NOT_SPECTATOR, "unregistered session key");
    expect_err(place(&mut w, &sa, 1, 0, 1000), E_NO_CREDITS, "more credits than held");
    let b = book(&w);
    assert_eq!(b.spectators[0].credits, 85);
    assert_eq!((b.totals[0][0], b.totals[C0 as usize][3], b.n_bets), (10, 5, 2));
}

#[test]
fn picks_resolve_from_public_state_and_conserve_credits() {
    let mut w = live_raid(8);
    let (wa, sa, wb, sb) = (Keypair::new(), Keypair::new(), Keypair::new(), Keypair::new());
    register(&mut w, &wa, &sa);
    register(&mut w, &wb, &sb);
    place(&mut w, &sa, C0, 0, 30).unwrap(); // A: Tower cracks first
    place(&mut w, &sb, C0, 3, 10).unwrap(); // B: no crack
    resolve(&mut w); // first resolve: snapshot of public state
    w.advance_secs(31); // KNOCKOUT window 1: open 30, lock 38, watches 38..68
    place(&mut w, &sa, D0 + 1, 0, 20).unwrap(); // A: YES
    place(&mut w, &sb, D0 + 1, 1, 20).unwrap(); // B: NO
    w.advance_secs(8);
    resolve(&mut w);
    assert_eq!(book(&w).outcome[(D0 + 1) as usize], 255, "undecided before anything happens");
    // A real knockout inside the watched window: raider 2 shoots raider 1 three times.
    let me = w.rprv(0);
    w.walk_to(1, me.x, me.y, 300);
    for _ in 0..3 { w.warp_er(SHOT_COOLDOWN_SLOTS); w.try_shoot(1, 0).unwrap(); }
    assert!(!w.rpub(0).alive, "raider 1 knocked out");
    resolve(&mut w);
    let b = book(&w);
    assert_eq!(b.outcome[(D0 + 1) as usize], 0, "KNOCKOUT window 1 resolved YES from RaiderPublic.alive");
    assert_eq!(b.spectators[0].credits, 100 - 30 - 20 + 40, "A won the whole 40-credit pool");
    w.advance_secs(40); // past NEXT CRACK window 0's watched minute (10..70) with no crack (no oracle → flat prices)
    resolve(&mut w);
    assert_eq!(book(&w).outcome[C0 as usize], 3, "NONE");
    w.advance_secs(240); // raid over: every remaining pool resolves
    resolve(&mut w);
    let b = book(&w);
    assert!(b.outcome.iter().all(|&o| o != 255), "every pool resolved");
    assert_eq!(b.spectators[1].credits, 100 - 10 - 20 + 40, "B won NEXT CRACK (NONE)");
    let total: u32 = (0..b.n_spec as usize).map(|i| b.spectators[i].credits).sum();
    assert_eq!(total, 200, "credits conserved: every pool paid out or refunded");
}

#[test]
fn resolver_reads_only_public_accounts() {
    let metas = resolve_accounts().to_account_metas(None);
    let private: Vec<Pubkey> = (0..8u8).flat_map(|s| [slot_pda(RPRV_SEED, s), slot_pda(VIEW_SEED, s)])
        .chain((0..(NUM_CRATES as u8 + 8)).map(crate_pda)).chain([secret_pda()]).collect();
    for m in &metas { assert!(!private.contains(&m.pubkey), "resolve_picks must not take a private account: {}", m.pubkey); }
    assert_eq!(metas.len(), 13, "book + raid + 3 districts + 8 RaiderPublic");
    assert!(metas.iter().filter(|m| m.is_writable).all(|m| m.pubkey == picks_pda()), "only the book is written");
}

#[test]
fn cancel_refunds_every_open_pool() {
    let mut w = live_raid(8);
    let (wa, sa) = (Keypair::new(), Keypair::new());
    register(&mut w, &wa, &sa);
    place(&mut w, &sa, 0, 0, 25).unwrap();
    place(&mut w, &sa, C0, 1, 25).unwrap();
    let stranger = Keypair::new();
    let c = |signer: Pubkey| ix(instruction::CancelPicks {}, accounts::CancelPicks { book: picks_pda(), raid: raid_pda(), keeper: signer });
    expect_err(w.try_send(TransactionTarget::Ephemeral, &[&stranger], &[c(kp(&stranger))]), E_UNAUTHORIZED, "only the keeper cancels");
    let keeper = w.keeper.insecure_clone();
    w.send(TransactionTarget::Ephemeral, &[&keeper], &[c(kp(&keeper))], "cancel_picks");
    let b = book(&w);
    assert_eq!((b.status, b.spectators[0].credits), (2, 100), "cancelled, full refund");
    expect_err(place(&mut w, &sa, 1, 0, 5), E_PICKS_CLOSED, "no picks after cancel");
}

#[test]
fn streak_badge_from_vrf_seed_committed_and_claimed_once() {
    let mut w = live_raid(8);
    let (wa, sa) = (Keypair::new(), Keypair::new());
    register(&mut w, &wa, &sa);
    w.advance_secs(1);
    place(&mut w, &sa, D0, 1, 5).unwrap();
    resolve(&mut w); // snapshot
    w.advance_secs(30);
    place(&mut w, &sa, D0 + 1, 1, 5).unwrap();
    w.advance_secs(30);
    place(&mut w, &sa, D0 + 2, 1, 5).unwrap();
    let keeper = w.keeper.insecure_clone();
    let close = |payer: Pubkey| ix(instruction::ClosePicks { raid_id: RAID_ID }, accounts::ClosePicks {
        payer, book: picks_pda(), secret: secret_pda(),
        magic_context: ephemeral_rollups_sdk::consts::MAGIC_CONTEXT_ID, magic_program: MAGIC_PROGRAM_ID,
    });
    expect_err(w.try_send(TransactionTarget::Ephemeral, &[&keeper], &[close(kp(&keeper))]), E_PICKS_OPEN, "close before every pool resolved");
    w.advance_secs(300);
    resolve(&mut w);
    let b = book(&w);
    assert_eq!((b.spectators[0].correct, b.spectators[0].best_streak), (3, 3), "three NO calls in a row");
    w.send(TransactionTarget::Ephemeral, &[&keeper], &[close(kp(&keeper))], "close_picks (commit + undelegate)");
    w.warp_er(1); // undelegation completes: the book is owned by the program on base again
    assert_eq!(w.svm.get_account_for(TransactionTarget::Base, &a(picks_pda())).unwrap().owner, a(pid()), "book undelegated to the program");
    let on_base = book_at(&w, TransactionTarget::Base);
    let badge = on_base.spectators[0].badge;
    assert!((1..=4).contains(&badge), "streak badge variant from the VRF seed, got {badge}");
    assert_eq!(on_base.status, 1);
    // Base: badge mint, then a permissionless claim mints 1 badge to the spectator's wallet, once.
    w.send(TransactionTarget::Base, &[&keeper], &[ix(instruction::InitBadgeMint {}, accounts::InitBadgeMint {
        config: config_pda(), mint_auth: mint_auth(), badge_mint: badge_mint_pda(), keeper: kp(&keeper), token_program: TOKEN_PROGRAM_ID, system_program: system_program::ID,
    })], "init_badge_mint");
    let claim = ix(instruction::ClaimBadge { raid_id: RAID_ID, spec: 0 }, accounts::ClaimBadge {
        config: config_pda(), book: picks_pda(), mint_auth: mint_auth(), badge_mint: badge_mint_pda(), wallet: kp(&wa),
        wallet_ata: ata(kp(&wa), badge_mint_pda()), payer: kp(&keeper), token_program: TOKEN_PROGRAM_ID,
        associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID, system_program: system_program::ID,
    });
    w.send(TransactionTarget::Base, &[&keeper], &[claim.clone()], "claim_badge");
    assert_eq!(w.token_balance(ata(kp(&wa), badge_mint_pda())), 1, "one transferable badge token");
    // A second claim must never pay. (MagicSVM shows the book owned by the Delegation Program again right after a base
    // write that follows an ER commit, so here the refusal is the owner check; the badge_claimed flag is checked on devnet.)
    assert!(w.try_send(TransactionTarget::Base, &[&keeper], &[claim]).is_err(), "claimed twice");
    assert_eq!(w.token_balance(ata(kp(&wa), badge_mint_pda())), 1, "still exactly one badge");
}
