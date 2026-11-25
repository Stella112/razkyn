//! M4 MagicSVM tests (CLAUDE.md §9): test 1 (full: 8 raiders → end → Results conserve value →
//! commit-and-undelegate with the finalize_raid action → claims sum to escrow), test 5 (direct
//! finalize / claim before settlement rejected, claim twice never pays twice, settle_stuck
//! guarded), plus unit tests of the Option A payout math (DECISIONS #21).
mod common;
use common::*;
use razkyn::instructions::settle::{compute_payouts, value_of};
use razkyn::state::RaiderSlot;

const N: u8 = 8;

fn walk_to_exit(w: &mut World, slot: u8, exit: u8) {
    let (x, y) = razkyn::util::exit_point_units(exit);
    w.walk_to(slot, x, y, 50);
}

fn loot_nearest(w: &mut World, slot: u8) -> [u64; 3] {
    let me = w.rprv(slot);
    let raid = w.raid();
    let (idx, _) = (0..NUM_CRATES as u8)
        .filter(|i| (*i as usize) % CRATES_PER_DISTRICT < ACTIVE_PER_DISTRICT)
        .filter(|i| w.crate_acc(*i).state == crate_state::SEALED)
        .map(|i| (i, raid.crate_pos[i as usize]))
        .min_by_key(|(_, p)| razkyn::util::dist2(me.x, me.y, p.x, p.y))
        .unwrap();
    let p = raid.crate_pos[idx as usize];
    w.walk_to(slot, p.x, p.y, 50);
    w.try_open(slot, idx).unwrap();
    w.warp_er(OPEN_CHANNEL_SLOTS);
    w.try_finish(slot, idx).unwrap();
    w.rprv(slot).backpack
}

fn tick(w: &mut World, secs: i64) {
    w.advance_secs(secs);
    w.warp_er(TICK_SLOTS);
    let k = w.keeper.insecure_clone();
    let t = w.tick_ixs();
    w.send(TransactionTarget::Ephemeral, &[&k], &t, "tick");
}

// ---------------- §9 tests 1 (full) and 5 ----------------
#[test]
fn test1_full_raid_settles_and_claims_sum_to_escrow_test5_guards() {
    use TransactionTarget::{Base, Ephemeral};
    let mut w = live_raid_seeded(N, Some([5u8; 32]));
    let escrow = ata(escrow_auth(), w.dusd);
    assert_eq!(w.token_balance(escrow), STAKE * N as u64);
    let stranger = Keypair::new();
    w.svm.airdrop(&stranger.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();

    // Loot: slots 0 and 2 each open a crate; slot 0 and 1 will extract, slot 2 will not.
    let bp0 = loot_nearest(&mut w, 0);
    let _bp2 = loot_nearest(&mut w, 2);

    // Exit window 1 opens at t = 120 s.
    tick(&mut w, 0);
    expect_err(w.try_start_extract(0, 0), E_EXIT_CLOSED, "no window open yet");
    tick(&mut w, 120);
    let raid = w.raid();
    assert_eq!(raid.exit_window, 1);
    let open = raid.open_exits;
    let closed = (0..NUM_EXITS as u8).find(|e| !open.contains(e)).unwrap();
    expect_err(w.try_start_extract(0, closed), E_EXIT_CLOSED, "closed exit");
    // Both walk first (walking warps slots), then both start the 5 s channel together.
    for s in [0u8, 1] {
        walk_to_exit(&mut w, s, open[0]);
    }
    for s in [0u8, 1] {
        w.try_start_extract(s, open[0]).unwrap();
    }
    w.warp_er(EXTRACT_CHANNEL_SLOTS - 10);
    expect_err(w.try_finish_extract(0), E_CHANNEL_NOT_DONE, "extract before 5 s");
    w.warp_er(10);
    for s in [0u8, 1] {
        w.try_finish_extract(s).unwrap();
        let u = w.rpub(s);
        assert!(u.extracted && u.exposed, "slot {s} extracted, position public");
    }
    w.warp_er(TICK_SLOTS);
    expect_err(w.try_move(0, 1, 0), ERR_EXTRACTED, "extracted raider frozen");

    // Not ended yet: others are still in the raid and < 300 s.
    let k = w.keeper.insecure_clone();
    let e = w.end_raid_ix(kp(&stranger));
    expect_err(w.try_send(Ephemeral, &[&stranger], &[e]), E_NOT_ENDED, "end_raid before the end");

    // §9 test 5 (before settlement): claim → NotSettled; finalize called directly → Unauthorized.
    expect_err(w.try_send(Base, &[&stranger], &[w.claim_ix(0, kp(&stranger))]), E_NOT_SETTLED, "claim before settlement");
    let direct = direct_finalize_ix(&w, &stranger);
    expect_err(w.try_send(Base, &[&stranger], &[direct]), E_UNAUTHORIZED, "finalize_raid called directly");

    // Raid ends at 300 s; anyone calls end_raid → Results + commit/undelegate + finalize action.
    tick(&mut w, 180);
    assert_eq!(w.raid().status, status::ENDED);
    let e = w.end_raid_ix(kp(&stranger));
    w.send(Ephemeral, &[&stranger], &[cu_ix(1_400_000), e], "end_raid");
    let s = w.settlement();
    assert!(s.settled && s.settled_via == 1, "settled by the post-commit finalize_raid action");
    let r = w.results_base().expect("Results committed to base");
    let owner_now = w.svm.get_account_for(Base, &a(raid_pda())).unwrap().owner;
    w.warp_er(1);
    let owner_next = w.svm.get_account_for(Base, &a(raid_pda())).unwrap().owner;
    println!("Raid owner on base: right after end_raid = {owner_now}, one slot later = {owner_next}");
    let res_owner = w.svm.get_account_for(Base, &a(results_pda())).unwrap().owner;
    let raid_base: Option<Raid> = w.read(Base, raid_pda());
    println!("Results owner on base = {res_owner}; Raid on base status = {:?}", raid_base.map(|r| r.status));
    println!("delegation record for raid exists = {}", w.svm.get_account_for(Base, &a(ephemeral_rollups_sdk::pda::delegation_record_pda_from_delegated_account(&raid_pda()))).is_some());
    assert_eq!(owner_next, a(pid()), "Raid undelegated back to the program");
    assert_eq!(r.results_hash, s.results_hash);
    assert_eq!(r.dusd_total + r.reserve_total + r.ops, STAKE * N as u64, "conservation in Results");
    assert_eq!(r.ops, OPS_FEE * N as u64);
    assert_eq!(r.raiders[0].mint_units, bp0, "extracted slot 0 mints its backpack");
    assert_eq!(r.raiders[1].mint_units, [0; 3]);
    assert_eq!(r.raiders[2].mint_units, [0; 3], "slot 2 did not extract: its loot went to the pool");
    assert_eq!(w.token_balance(ata(kp(&w.admin), w.dusd)), r.ops, "ops to treasury");
    assert_eq!(w.token_balance(ata(reserve_auth(), w.dusd)), r.reserve_total, "backing to reserve");
    let _ = k;

    // Claims by a stranger (permissionless) for every raider.
    let mut paid = 0u64;
    for slot in 0..N {
        w.send(Base, &[&stranger], &[w.claim_ix(slot, kp(&stranger))], "claim");
        let wallet = kp(&w.raiders[slot as usize].wallet);
        let got = w.token_balance(ata(wallet, w.dusd));
        assert_eq!(got, r.raiders[slot as usize].dusd_payout, "slot {slot} dUSD");
        paid += got;
        for a_ in 0..3 {
            assert_eq!(w.token_balance(ata(wallet, w.mints[1 + a_])), r.raiders[slot as usize].mint_units[a_], "slot {slot} asset {a_}");
        }
    }
    assert_eq!(paid, r.dusd_total);
    assert_eq!(w.token_balance(escrow), 0, "claims + ops + reserve drain the escrow exactly");
    assert_eq!(paid + r.ops + r.reserve_total, STAKE * N as u64, "§9 test 1: claims sum to escrow");

    // §9 test 5 (after settlement): claim twice never pays twice.
    let before = w.token_balance(ata(kp(&w.raiders[0].wallet), w.dusd));
    w.svm.warp_to_slot(w.svm.base().get_sysvar::<Clock>().slot + 1);
    assert!(w.try_send(Base, &[&stranger], &[w.claim_ix(0, kp(&stranger))]).is_err(), "second claim fails");
    assert_eq!(w.token_balance(ata(kp(&w.raiders[0].wallet), w.dusd)), before, "no second payment");
    // finalize again (direct) and settle_stuck after settlement are refused.
    let direct = direct_finalize_ix(&w, &stranger);
    expect_err(w.try_send(Base, &[&stranger], &[direct]), E_UNAUTHORIZED, "finalize_raid direct after settlement");
    let stuck = ix(instruction::SettleStuckRaid {}, accounts::SettleStuckRaid { settle: w.settle_accounts(), payer: kp(&stranger) });
    expect_err(w.try_send(Base, &[&stranger], &[stuck.clone()]), E_TOO_EARLY, "settle_stuck before 120 s");
    w.advance_secs(SETTLE_STUCK_SECS + 1);
    expect_err(w.try_send(Base, &[&stranger], &[stuck]), E_ALREADY_SETTLED, "settle_stuck when already settled");
}

const ERR_EXTRACTED: u32 = 6011;

/// finalize_raid sent directly by a wallet: the escrow PDA cannot sign, so it is passed unsigned.
fn direct_finalize_ix(w: &World, wallet: &Keypair) -> Instruction {
    let auth = kp(wallet);
    let escrow = ephemeral_rollups_sdk::pda::ephemeral_balance_pda_from_payer(&auth, 255);
    ix(
        instruction::FinalizeRaid {},
        accounts::FinalizeRaid { settle: w.settle_accounts(), source_program: pid(), escrow_auth: auth, escrow },
    )
    .tap_unsigned(kp(wallet))
}

trait Unsigned {
    fn tap_unsigned(self, _payer: Pubkey) -> Self;
}
impl Unsigned for Instruction {
    fn tap_unsigned(mut self, _payer: Pubkey) -> Self {
        for m in self.accounts.iter_mut() {
            m.is_signer = false;
        }
        self
    }
}

// ---------------- Option A math (DECISIONS #21) ----------------
fn slots(extracted: &[bool]) -> [RaiderSlot; MAX_RAIDERS] {
    let mut r = [RaiderSlot::default(); MAX_RAIDERS];
    for (i, e) in extracted.iter().enumerate() {
        r[i] = RaiderSlot { wallet: Pubkey::new_unique(), raid_key: Pubkey::new_unique(), stake: STAKE, joined: true, alive: true, extracted: *e, is_bot: false };
    }
    r
}

fn check_conserved(p: &razkyn::instructions::settle::Payouts) {
    assert_eq!(p.dusd_total + p.reserve_total + p.ops, p.stakes_total, "conservation");
    assert!(p.reserve_total <= p.loot_pool);
}

#[test]
fn option_a_no_extraction_all_loot_back_pro_rata() {
    let p = compute_payouts(&slots(&[false; 8]), &[[1_000_000, 0, 0]; 8], &[PRICE_ONE; 3]).unwrap();
    check_conserved(&p);
    assert_eq!(p.reserve_total, 0);
    assert_eq!(p.leftover, LOOT_POOL * 8);
    for r in p.raiders.iter() {
        assert_eq!(r.dusd_payout, PROTECTED + LOOT_POOL, "protected + equal share");
    }
}

#[test]
fn option_a_rally_scales_extracted_backpacks_to_the_pool() {
    // 2 raiders, pool 11 dUSD. Slot 0 extracted 10 units of Tower; Tower doubled → worth 20 > 11.
    let mut b = [[0u64; 3]; 8];
    b[0] = [10_000_000, 0, 0];
    let p = compute_payouts(&slots(&[true, false]), &b, &[2 * PRICE_ONE, PRICE_ONE, PRICE_ONE]).unwrap();
    check_conserved(&p);
    assert!(p.scaled);
    assert_eq!(p.extracted_value, 20_000_000);
    assert_eq!(p.raiders[0].mint_units[0], 5_500_000, "scaled to 11/20");
    assert_eq!(p.raiders[0].mint_value, 11_000_000);
    assert_eq!(p.leftover, 0);
    assert_eq!(p.raiders[1].dusd_payout, PROTECTED);
}

#[test]
fn option_a_fall_leaves_more_for_the_pool() {
    let mut b = [[0u64; 3]; 8];
    b[0] = [0, 2_000_000, 0];
    let p = compute_payouts(&slots(&[true, false]), &b, &[PRICE_ONE, 500_000, PRICE_ONE]).unwrap();
    check_conserved(&p);
    assert_eq!(p.raiders[0].mint_value, 1_000_000, "Factory halved");
    assert_eq!(p.leftover, 10_000_000);
    assert_eq!(p.raiders[0].dusd_payout + p.raiders[1].dusd_payout, 2 * PROTECTED + 10_000_000);
}

#[test]
fn option_a_randomized_conservation() {
    let mut x: u64 = 0x2545F4914F6CDD1D;
    let mut rnd = || { x ^= x << 13; x ^= x >> 7; x ^= x << 17; x };
    for _ in 0..300 {
        let n = 2 + (rnd() % 7) as usize;
        let ex: Vec<bool> = (0..n).map(|_| rnd() % 2 == 0).collect();
        let mut b = [[0u64; 3]; 8];
        for row in b.iter_mut().take(n) {
            for v in row.iter_mut() {
                *v = rnd() % 20_000_000;
            }
        }
        let prices = [300_000 + rnd() % 3_000_000, 300_000 + rnd() % 3_000_000, 300_000 + rnd() % 3_000_000];
        let p = compute_payouts(&slots(&ex), &b, &prices).unwrap();
        check_conserved(&p);
        let minted: u64 = p.raiders.iter().map(|r| value_of(&r.mint_units, &prices).unwrap()).sum();
        assert_eq!(minted, p.reserve_total, "reserve backs exactly the minted units");
    }
}
