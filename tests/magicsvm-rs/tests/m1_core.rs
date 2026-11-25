//! M1 MagicSVM tests (CLAUDE.md §9): test 3 (movement cheat rejected) and test 4 (wrong signer
//! rejected), plus tick gating, fog, privacy and the faucet cap.
//! Run: scripts/test-magicsvm.sh (cargo +stable test).
mod common;
use common::*;

// ---------------- §9 test 3: movement cheat → rejected ----------------
#[test]
fn test3_movement_cheat_rejected() {
    let mut w = live_raid(2);
    let start = w.rprv(0);
    assert!(start.x <= MAX_X && start.y <= MAX_Y, "spawn inside the map");

    // 10 slots elapsed → budget 60 units: 61 rejected, diagonal 60.8 rejected, 60 accepted.
    w.warp_er(10);
    expect_err(w.try_move(0, inward(start.x, 61), 0), E_TOO_FAST, "61-unit jump");
    expect_err(w.try_move(0, inward(start.x, 43), inward(start.y, 43)), E_TOO_FAST, "diagonal jump");
    let dx = inward(start.x, 60);
    w.try_move(0, dx, 0).expect("legal 60-unit move");
    let after = w.rprv(0);
    assert_eq!(after.x as i32, start.x as i32 + dx as i32);

    // No slots elapsed since the last move → budget 0.
    expect_err(w.try_move(0, inward(after.x, 1), 0), E_TOO_FAST, "move with no elapsed time");

    // 5 slots → budget 30.
    w.warp_er(5);
    expect_err(w.try_move(0, inward(after.x, 31), 0), E_TOO_FAST, "31 units after 5 slots");
    w.try_move(0, inward(after.x, 30), 0).expect("30 units after 5 slots");

    // Leaving the map is rejected even at legal speed.
    let cur = w.rprv(0);
    w.warp_er(10);
    let off = if cur.y < 60 { -(cur.y as i16) - 1 } else if cur.y > MAX_Y - 60 { (MAX_Y - cur.y) as i16 + 1 } else { 0 };
    if off != 0 {
        expect_err(w.try_move(0, 0, off), E_OUT_OF_BOUNDS, "off-map move");
    }
}

// ---------------- §9 test 4: wrong signer for a slot → rejected ----------------
#[test]
fn test4_wrong_signer_rejected() {
    use TransactionTarget::Ephemeral;
    let mut w = live_raid(2);
    w.warp_er(10);
    let start = w.rprv(0);
    let other_key = w.rk(1);
    let wallet = w.raiders[0].wallet.insecure_clone();
    let keeper = w.keeper.insecure_clone();
    let d = inward(start.x, 10);
    for (signer, what) in [(&other_key, "other raid key"), (&wallet, "wallet instead of raid key"), (&keeper, "keeper")] {
        let i = w.move_ix(0, kp(signer), d, 0);
        expect_err(w.try_send(Ephemeral, &[signer], &[i]), E_WRONG_RAID_KEY, what);
    }
    // Wrong signer for shooting and crate opening too.
    let i = ix(
        instruction::Shoot { slot: 0, target: 1 },
        accounts::Shoot {
            raid: raid_pda(), shooter_prv: slot_pda(RPRV_SEED, 0), shooter_pub: slot_pda(RPUB_SEED, 0),
            target_prv: slot_pda(RPRV_SEED, 1), target_pub: slot_pda(RPUB_SEED, 1),
            drop_crate: crate_pda(DROP_CRATE_BASE + 1), raid_key: kp(&other_key),
        },
    );
    expect_err(w.try_send(Ephemeral, &[&other_key], &[i]), E_WRONG_RAID_KEY, "shoot as slot 0 with slot 1's key");
    let mut open = w.open_ix(0, 0, 0);
    open.accounts.last_mut().unwrap().pubkey = other_key.pubkey();
    expect_err(w.try_send(Ephemeral, &[&other_key], &[open]), E_WRONG_RAID_KEY, "open as slot 0 with slot 1's key");
    assert_eq!(w.rprv(0).x, start.x, "position unchanged after rejected moves");
    w.try_move(0, d, 0).expect("own raid key");
}

// ---------------- M1 extras: tick gating, fog, privacy, faucet cap ----------------
#[test]
fn m1_tick_fog_privacy_and_faucet() {
    use TransactionTarget::{Base, Ephemeral};
    let mut w = live_raid(3);
    let anyone = Keypair::new();
    w.svm.airdrop(&anyone.pubkey(), LAMPORTS_PER_SOL).unwrap();
    let ticks = w.tick_ixs();

    // Tick: permissionless, at most once per TICK_SLOTS.
    w.warp_er(TICK_SLOTS);
    w.send(Ephemeral, &[&anyone], &ticks, "tick + fog by a stranger");
    assert_eq!(w.raid().tick_no, 1);
    w.warp_er(3);
    w.send(Ephemeral, &[&anyone], &ticks[..1], "early tick is a no-op");
    assert_eq!(w.raid().tick_no, 1, "no advance before TICK_SLOTS");
    w.warp_er(TICK_SLOTS);
    w.send(Ephemeral, &[&anyone], &ticks, "tick 2");
    assert_eq!(w.raid().tick_no, 2);

    // Fog: each View lists exactly the raiders within 8 tiles.
    let pos: Vec<RaiderPrivate> = (0..3).map(|s| w.rprv(s)).collect();
    for s in 0..3u8 {
        let who = w.raiders[s as usize].raid_key.pubkey();
        let v: View = w.read_as(Some(who), slot_pda(VIEW_SEED, s)).expect("own view visible");
        assert_eq!(v.tick_no, 2);
        let expected: Vec<u8> = (0..3u8)
            .filter(|&o| o != s)
            .filter(|&o| razkyn::util::dist2(pos[s as usize].x, pos[s as usize].y, pos[o as usize].x, pos[o as usize].y) <= VISION_UNITS * VISION_UNITS)
            .collect();
        let got: Vec<u8> = v.entries[..v.count as usize].iter().map(|e| e.slot).collect();
        assert_eq!(got, expected, "view of slot {s}");
    }

    // Privacy (MagicSVM model of PER reads).
    let other = w.raiders[1].raid_key.pubkey();
    for viewer in [None, Some(anyone.pubkey()), Some(other)] {
        w.svm.set_authorized_user(viewer);
        assert!(w.svm.get_account_for(Ephemeral, &a(slot_pda(RPRV_SEED, 0))).is_none(), "rprv0 hidden from {viewer:?}");
        assert!(w.svm.get_account_for(Ephemeral, &a(slot_pda(VIEW_SEED, 0))).is_none(), "view0 hidden from {viewer:?}");
        assert!(w.svm.get_account_for(Ephemeral, &a(secret_pda())).is_none(), "secret hidden from {viewer:?}");
        assert!(w.svm.get_account_for(Ephemeral, &a(crate_pda(0))).is_none(), "sealed crate hidden from {viewer:?}");
        assert!(w.svm.get_account_for(Ephemeral, &a(slot_pda(RPUB_SEED, 0))).is_some(), "rpub0 public");
    }
    w.svm.set_authorized_user(Some(w.keeper.pubkey()));
    assert!(w.svm.get_account_for(Ephemeral, &a(secret_pda())).is_some(), "keeper reads the secret");
    assert!(w.svm.get_account_for(Ephemeral, &a(slot_pda(RPRV_SEED, 0))).is_some(), "keeper reads rprv");
    assert!(w.svm.get_account_for(Ephemeral, &a(crate_pda(0))).is_some(), "keeper reads a sealed crate");
    w.svm.set_authorized_user(None);

    // Faucet cap: 100 dUSD per wallet per day.
    let u = Keypair::new();
    w.svm.airdrop(&u.pubkey(), LAMPORTS_PER_SOL).unwrap();
    let dusd = w.dusd;
    w.send(Base, &[&u], &[ix(instruction::FaucetDusd { amount: FAUCET_DUSD_DAILY_CAP }, faucet_accounts(kp(&u), dusd))], "faucet 100");
    expect_err(
        w.try_send(Base, &[&u], &[ix(instruction::FaucetDusd { amount: 1 }, faucet_accounts(kp(&u), dusd))]),
        E_FAUCET_CAP,
        "101st dUSD",
    );
}
