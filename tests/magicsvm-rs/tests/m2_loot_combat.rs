//! M2 MagicSVM tests (CLAUDE.md §9): test 1 (partial: 8 scripted raiders, loot conserved
//! through crates, combat and drops, raid ends at 300 s) and test 2 (determinism: same seed →
//! identical layout, event log and end state). Settlement/claims for test 1 land in M4.
mod common;
use common::*;

const POOL_8: u64 = LOOT_POOL * 8; // 60 dUSD of loot for 8 raiders

/// Nearest crate of the wanted kind to `slot`.
fn nearest(w: &mut World, slot: u8, dormant: bool) -> (u8, Crate) {
    let me = w.rprv(slot);
    (0..NUM_CRATES as u8)
        .map(|i| (i, w.crate_acc(i)))
        .filter(|(_, c)| c.dormant == dormant && c.state == crate_state::SEALED)
        .min_by_key(|(_, c)| razkyn::util::dist2(me.x, me.y, c.x, c.y))
        .expect("a crate")
}

#[derive(Debug, PartialEq, Eq)]
struct Snapshot {
    spawns: Vec<(u16, u16)>,
    crates: Vec<(u16, u16, [u64; 3], bool, u8)>,
    events: Vec<String>,
    backpacks: Vec<[u64; 3]>,
    hps: Vec<u8>,
    kills: Vec<u8>,
}

/// The scripted raid used by both tests. Asserts conservation after every state change.
fn scripted_raid(seed: Option<[u8; 32]>) -> Snapshot {
    let mut w = live_raid_seeded(8, seed);
    let mut events = vec![];
    let spawns: Vec<(u16, u16)> = (0..8).map(|s| { let r = w.rprv(s); (r.x, r.y) }).collect();

    // --- crate layout: 12 per district, last 4 dormant, inside the district, loot exact ---
    let mut crates = vec![];
    let mut sum = 0u64;
    for idx in 0..NUM_CRATES as u8 {
        let c = w.crate_acc(idx);
        let d = idx as usize / CRATES_PER_DISTRICT;
        assert!(c.placed && c.state == crate_state::SEALED, "crate {idx} placed and sealed");
        assert_eq!(c.district as usize, d);
        assert_eq!(c.dormant, idx as usize % CRATES_PER_DISTRICT >= ACTIVE_PER_DISTRICT, "crate {idx} dormancy");
        assert_eq!(razkyn::util::district_of(c.x), Some(d), "crate {idx} inside its district");
        for a in 0..3 {
            if a != d {
                assert_eq!(c.units[a], 0, "crate {idx} only holds its district's asset");
            }
        }
        assert!(c.units[d] > 0);
        sum += c.units[d];
        crates.push((c.x, c.y, c.units, c.dormant, c.district));
    }
    assert_eq!(sum, POOL_8, "crates hold exactly the loot pool");
    // Positions are public (DECISIONS #16): a stranger reads them from Raid; contents stay hidden.
    let stranger = Some(Keypair::new().pubkey());
    let public_raid: Raid = w.read_as(stranger, raid_pda()).expect("raid is public");
    for (idx, c) in crates.iter().enumerate() {
        assert_eq!((public_raid.crate_pos[idx].x, public_raid.crate_pos[idx].y), (c.0, c.1), "public position of crate {idx}");
        assert!(w.read_as::<Crate>(stranger, crate_pda(idx as u8)).is_none(), "crate {idx} contents hidden from a stranger");
    }
    assert_eq!(w.total_units(), POOL_8);

    // --- crate rules ---
    let (dormant_idx, _) = nearest(&mut w, 0, true);
    w.warp_er(TICK_SLOTS);
    expect_err(w.try_open(0, dormant_idx), E_CRATE_DORMANT, "dormant crate while district asleep");
    let (idx, c) = nearest(&mut w, 0, false);
    let me = w.rprv(0);
    if razkyn::util::dist2(me.x, me.y, c.x, c.y) > OPEN_RANGE_UNITS * OPEN_RANGE_UNITS {
        expect_err(w.try_open(0, idx), E_OUT_OF_RANGE, "open from afar");
    }
    expect_err(w.try_finish(0, idx), E_NO_CHANNEL, "finish without open");
    w.walk_to(0, c.x, c.y, 50);
    w.try_open(0, idx).expect("open in range");
    w.warp_er(OPEN_CHANNEL_SLOTS - 10);
    expect_err(w.try_finish(0, idx), E_CHANNEL_NOT_DONE, "finish before 2 s");
    w.warp_er(10);
    w.try_finish(0, idx).expect("finish after 2 s");
    let bp0 = w.rprv(0).backpack;
    assert_eq!(bp0, c.units, "crate units moved into the backpack");
    let stranger = Keypair::new().pubkey();
    let opened: Crate = w.read_as(Some(stranger), crate_pda(idx)).expect("opened crate is public");
    assert_eq!((opened.state, opened.opened_units, opened.units, opened.opened_by), (crate_state::OPENED, c.units, [0; 3], 0));
    expect_err(w.try_open(0, idx), E_CRATE_NOT_OPENABLE, "re-open an opened crate");
    events.push(format!("open slot0 crate{idx} {:?}", c.units));
    assert_eq!(w.total_units(), POOL_8, "conserved after open");

    // --- combat: slot 1 hunts slot 0 ---
    let target = w.rprv(0);
    let me1 = w.rprv(1);
    if razkyn::util::dist2(me1.x, me1.y, target.x, target.y) > SHOOT_RANGE_UNITS * SHOOT_RANGE_UNITS {
        w.warp_er(SHOT_COOLDOWN_SLOTS);
        expect_err(w.try_shoot(1, 0), E_OUT_OF_RANGE, "shoot from afar");
    }
    w.walk_to(1, target.x, target.y, 400);
    w.warp_er(SHOT_COOLDOWN_SLOTS);
    w.try_shoot(1, 0).expect("hit 1");
    expect_err(w.try_shoot(1, 0), E_COOLDOWN, "second shot inside 500 ms");
    assert_eq!(w.rpub(0).hp, MAX_HP - SHOT_DAMAGE);
    w.warp_er(SHOT_COOLDOWN_SLOTS);
    w.try_shoot(1, 0).expect("hit 2");
    w.warp_er(SHOT_COOLDOWN_SLOTS);
    w.try_shoot(1, 0).expect("hit 3 (kill)");
    let dead = w.rpub(0);
    let last = w.rprv(0);
    assert!(!dead.alive && dead.hp == 0 && dead.exposed, "slot 0 dead and exposed");
    assert_eq!((dead.pub_x, dead.pub_y), (last.x, last.y), "last position published");
    assert!(!w.raid().raiders[0].alive);
    assert_eq!(w.rpub(1).kills, 1);
    assert_eq!(last.backpack, [0; 3], "backpack emptied");
    let drop: Crate = w.read_as(Some(stranger), crate_pda(DROP_CRATE_BASE)).expect("drop crate is public");
    assert_eq!(drop.units, bp0, "backpack became the drop crate");
    events.push(format!("kill slot1->slot0 drop {:?}", drop.units));
    assert_eq!(w.total_units(), POOL_8, "conserved after the kill");
    w.warp_er(TICK_SLOTS);
    expect_err(w.try_move(0, 1, 0), E_RAIDER_DEAD, "dead raider cannot move");
    w.warp_er(SHOT_COOLDOWN_SLOTS);
    let cant_shoot = w.try_shoot(1, 0);
    assert!(cant_shoot.is_err(), "cannot shoot a dead raider");

    // --- loot the drop crate ---
    w.walk_to(1, drop.x, drop.y, 50);
    w.try_open(1, DROP_CRATE_BASE).expect("open drop crate");
    w.warp_er(OPEN_CHANNEL_SLOTS);
    w.try_finish(1, DROP_CRATE_BASE).expect("finish drop crate");
    let bp1 = w.rprv(1).backpack;
    assert_eq!(bp1, bp0, "slot 1 now carries slot 0's loot");
    events.push(format!("loot slot1 drop {:?}", bp1));
    assert_eq!(w.total_units(), POOL_8, "conserved after looting the drop");

    // --- every other raider moves a bit; ticks run; raid ends at 300 s ---
    for s in 2..8u8 {
        let r = w.rprv(s);
        w.warp_er(TICK_SLOTS);
        w.try_move(s, inward(r.x, 50), inward(r.y, 20)).expect("bot move");
    }
    let keeper = w.keeper.insecure_clone();
    let ticks = w.tick_ixs();
    w.warp_er(TICK_SLOTS);
    w.send(TransactionTarget::Ephemeral, &[&keeper], &ticks, "tick");
    w.advance_secs(RAID_SECS);
    w.warp_er(TICK_SLOTS);
    w.send(TransactionTarget::Ephemeral, &[&keeper], &ticks, "final tick");
    assert_eq!(w.raid().status, status::ENDED, "raid ends at 300 s");
    w.warp_er(TICK_SLOTS);
    let blocked = w.try_move(2, 1, 0);
    assert!(blocked.is_err(), "no moves after the end");
    assert_eq!(w.total_units(), POOL_8, "conserved at the end");

    Snapshot {
        spawns,
        crates,
        events,
        backpacks: (0..8).map(|s| w.rprv(s).backpack).collect(),
        hps: (0..8).map(|s| w.rpub(s).hp).collect(),
        kills: (0..8).map(|s| w.rpub(s).kills).collect(),
    }
}

// ---------------- §9 test 1 (partial) ----------------
#[test]
fn test1_partial_eight_raiders_loot_conserved() {
    let snap = scripted_raid(None);
    assert_eq!(snap.kills.iter().map(|k| *k as u32).sum::<u32>(), 1);
}

// ---------------- §9 test 2: determinism ----------------
#[test]
fn test2_same_seed_same_outcome() {
    let seed = [7u8; 32];
    let a1 = scripted_raid(Some(seed));
    let a2 = scripted_raid(Some(seed));
    assert_eq!(a1, a2, "same seed → identical spawns, crates, event log and end state");
    let b = scripted_raid(Some([9u8; 32]));
    assert_ne!(a1.crates, b.crates, "a different seed changes the layout");
}
