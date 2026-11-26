//! M3 MagicSVM tests (CLAUDE.md §9): test 6 (verify_slice rejects a wrong slice or a wrong
//! leaf; a Mystery raid cannot start unverified), plus market steps driving the map (dormant
//! wake, hazards → hazard death → drop_backpack), trades with exposure, and Live mode holding
//! prices when no valid feed is passed.
mod common;
use common::*;
use razkyn::instructions::market::{merkle_root, mystery_leaf};
use razkyn::util::derive_u64;

const SEED: [u8; 32] = [3u8; 32];
const LEAVES: u32 = 4;

/// Designed day: district 0 rises to +3% (wakes), district 1 falls to −6% (hazard level 2),
/// district 2 is flat. Index ×10^4, step 0 = 100.0000.
fn designed_slice() -> Vec<u32> {
    let mut v = Vec::with_capacity(SLICE_LEN);
    for step in 0..SLICE_STEPS as u32 {
        let k = step.min(10);
        v.push(1_000_000 + 3_000 * k); // +0.3% per step to +3%
        v.push(1_000_000 - 6_000 * k); // −0.6% per step to −6%
        v.push(1_000_000);
    }
    v
}

fn bytes_of(slice: &[u32]) -> Vec<u8> {
    slice.iter().flat_map(|x| x.to_le_bytes()).collect()
}

fn data_hash(slice: &[u32]) -> [u8; 32] {
    solana_sha256_hasher::hashv(&[&bytes_of(slice)]).to_bytes()
}

struct Tree {
    leaves: Vec<[u8; 32]>,
    root: [u8; 32],
}

impl Tree {
    fn new(leaves: Vec<[u8; 32]>) -> Self {
        let h = |a: &[u8; 32], b: &[u8; 32]| solana_sha256_hasher::hashv(&[a.as_ref(), b.as_ref()]).to_bytes();
        let root = h(&h(&leaves[0], &leaves[1]), &h(&leaves[2], &leaves[3]));
        Tree { leaves, root }
    }
    fn proof(&self, i: usize) -> Vec<[u8; 32]> {
        let h = |a: &[u8; 32], b: &[u8; 32]| solana_sha256_hasher::hashv(&[a.as_ref(), b.as_ref()]).to_bytes();
        let pair = if i < 2 { h(&self.leaves[2], &self.leaves[3]) } else { h(&self.leaves[0], &self.leaves[1]) };
        vec![self.leaves[i ^ 1], pair]
    }
}

struct Day {
    id: [u8; 10],
    start: u32,
    slice: Vec<u32>,
    headlines: [u8; 32],
}

fn days() -> Vec<Day> {
    (0..LEAVES)
        .map(|i| {
            let mut slice = designed_slice();
            if i % 2 == 1 {
                slice[3] += i; // different data for some leaves
            }
            Day { id: *format!("2024-0{}-1{}", i + 1, i).as_bytes().first_chunk::<10>().unwrap(), start: 60 * i, slice, headlines: [i as u8; 32] }
        })
        .collect()
}

/// The VRF-chosen leaf index for the pinned seed, as the callback derives it.
fn chosen_index() -> usize {
    (derive_u64(&SEED, b"leaf", 0) % LEAVES as u64) as usize
}

fn load_ixs(w: &World, bytes: &[u8]) -> Vec<Instruction> {
    (0..SLICE_CHUNKS as u8)
        .map(|c| {
            let off = c as usize * SLICE_CHUNK;
            ix(
                instruction::LoadSlice { chunk: c, bytes: bytes[off..off + SLICE_CHUNK].to_vec() },
                accounts::LoadSlice { raid: raid_pda(), secret: secret_pda(), keeper: kp(&w.keeper) },
            )
        })
        .collect()
}

fn verify_ix(w: &World, d: &Day, proof: Vec<[u8; 32]>) -> Instruction {
    ix(
        instruction::VerifySlice { day_id: d.id, slice_start: d.start, headlines_hash: d.headlines, proof },
        accounts::VerifySlice { raid: raid_pda(), secret: secret_pda(), keeper: kp(&w.keeper) },
    )
}

fn mystery_world() -> (World, Vec<Day>, Tree, usize) {
    let ds = days();
    let tree = Tree::new(ds.iter().map(|d| mystery_leaf(&d.id, d.start, &data_hash(&d.slice), &d.headlines)).collect());
    let w = raid_seeded(2, Some(SEED), mode::MYSTERY, LEAVES, tree.root);
    let i = chosen_index();
    (w, ds, tree, i)
}

fn load(w: &mut World, bytes: &[u8]) {
    let k = w.keeper.insecure_clone();
    for i in load_ixs(w, bytes) {
        w.send(TransactionTarget::Ephemeral, &[&k], &[i], "load_slice");
    }
}

fn verified_live_world() -> World {
    let (mut w, ds, tree, i) = mystery_world();
    load(&mut w, &bytes_of(&ds[i].slice));
    let k = w.keeper.insecure_clone();
    let v = verify_ix(&w, &ds[i], tree.proof(i));
    w.send(TransactionTarget::Ephemeral, &[&k], &[v], "verify_slice");
    w.start();
    w
}

/// One tick (+ fog/hazards) after moving the unix clock `secs` and the slots `slots`.
fn tick(w: &mut World, secs: i64, slots: u64) {
    w.advance_secs(secs);
    w.warp_er(slots);
    let k = w.keeper.insecure_clone();
    let t = w.tick_ixs();
    w.send(TransactionTarget::Ephemeral, &[&k], &t, "tick");
}

fn district(w: &World, i: u8) -> District {
    w.read(TransactionTarget::Ephemeral, slot_pda(DISTRICT_SEED, i)).unwrap()
}

// ---------------- §9 test 6 ----------------
#[test]
fn test6_verify_slice_rejects_wrong_slice_and_wrong_leaf() {
    use TransactionTarget::Ephemeral;
    let (mut w, ds, tree, i) = mystery_world();
    let k = w.keeper.insecure_clone();
    // Proof sanity: the off-chain tree and the program's merkle_root agree.
    assert_eq!(merkle_root(tree.leaves[i], i as u32, &tree.proof(i)), tree.root);

    expect_err(w.try_start(), E_SLICE_NOT_VERIFIED, "start before verify");
    let v = verify_ix(&w, &ds[i], tree.proof(i));
    expect_err(w.try_send(Ephemeral, &[&k], &[v]), E_SLICE_NOT_LOADED, "verify before load");
    let bad_chunk = ix(
        instruction::LoadSlice { chunk: SLICE_CHUNKS as u8, bytes: vec![0; SLICE_CHUNK] },
        accounts::LoadSlice { raid: raid_pda(), secret: secret_pda(), keeper: kp(&k) },
    );
    expect_err(w.try_send(Ephemeral, &[&k], &[bad_chunk]), E_BAD_CHUNK, "chunk out of range");

    // Wrong slice: one value changed, correct metadata and proof.
    let mut tampered = ds[i].slice.clone();
    tampered[600] += 1;
    load(&mut w, &bytes_of(&tampered));
    let v = verify_ix(&w, &ds[i], tree.proof(i));
    expect_err(w.try_send(Ephemeral, &[&k], &[v]), E_BAD_PROOF, "tampered slice");

    // Wrong leaf: a different day with its own valid proof, but not the VRF-chosen index.
    let j = (i + 1) % LEAVES as usize;
    load(&mut w, &bytes_of(&ds[j].slice));
    let v = verify_ix(&w, &ds[j], tree.proof(j));
    expect_err(w.try_send(Ephemeral, &[&k], &[v]), E_BAD_PROOF, "valid leaf at the wrong index");
    // Right slice, wrong headlines hash.
    load(&mut w, &bytes_of(&ds[i].slice));
    let mut d = Day { id: ds[i].id, start: ds[i].start, slice: vec![], headlines: ds[i].headlines };
    d.headlines[0] ^= 1;
    let v = verify_ix(&w, &d, tree.proof(i));
    expect_err(w.try_send(Ephemeral, &[&k], &[v]), E_BAD_PROOF, "wrong headlines hash");
    // A stranger cannot load or verify.
    let stranger = Keypair::new();
    w.svm.airdrop(&stranger.pubkey(), LAMPORTS_PER_SOL).unwrap();
    let mut v = verify_ix(&w, &ds[i], tree.proof(i));
    v.accounts.last_mut().unwrap().pubkey = stranger.pubkey();
    assert!(w.try_send(Ephemeral, &[&stranger], &[v]).is_err(), "stranger verify rejected");

    // Correct slice, leaf and proof → verified → the raid starts.
    let v = verify_ix(&w, &ds[i], tree.proof(i));
    w.send(Ephemeral, &[&k], &[v], "verify_slice");
    w.svm.set_authorized_user(Some(k.pubkey()));
    let secret = w.svm.get_account_for(Ephemeral, &a(secret_pda())).unwrap();
    w.svm.set_authorized_user(None);
    assert_eq!(secret.data[8 + 89], 1, "secret.verified set");
    w.start();
}

// ---------------- market drives the map ----------------
#[test]
fn m3_market_steps_wake_and_hazards() {
    let mut w = verified_live_world();
    tick(&mut w, 0, TICK_SLOTS);
    for i in 0..3 {
        let d = district(&w, i);
        assert_eq!((d.start_price, d.current_price), (PRICE_ONE, PRICE_ONE), "step 0 at 100.0000 for district {i}");
    }
    // A dormant Tower crate is locked while the district is flat.
    let dormant = (0..NUM_CRATES as u8).find(|&i| i < 12 && i % 12 >= 8).unwrap();
    expect_err(w.try_open(0, dormant), E_CRATE_DORMANT, "dormant before wake");

    // 10 one-second steps: Tower +3% (awake), Factory −6% (hazard level 2).
    for _ in 0..10 {
        tick(&mut w, 1, TICK_SLOTS);
    }
    let (d0, d1, d2) = (district(&w, 0), district(&w, 1), district(&w, 2));
    assert_eq!(d0.current_price, 1_030_000);
    assert!(d0.awake && d0.hazard_level == 0, "Tower awake");
    assert_eq!(d1.current_price, 940_000);
    assert_eq!(d1.hazard_level, 2, "Factory hazard level 2 at −6%");
    assert_eq!(d2.hazard_level, 0);
    assert_eq!(w.raid().market_step, 10);
    assert!(d1.hist_len >= 11);
    // Dormant crate is no longer locked (it fails on range instead).
    match w.try_open(0, dormant) {
        Err((TransactionError::InstructionError(_, InstructionError::Custom(c)), _)) => assert_ne!(c, E_CRATE_DORMANT, "dormant lock lifted"),
        _ => {}
    }

    // Hazard: walk raider 1 into the Factory hazard band, then tick until dead.
    w.walk_to(1, 32 * 100 + 50, 20 * 100 + 50, 30);
    tick(&mut w, 0, TICK_SLOTS); // first tick after the walk covers the walk's slots (capped at 3 s)
    let before = w.rpub(1).hp;
    tick(&mut w, 0, 100); // 100 slots = 1 s → 10 HP
    assert_eq!(w.rpub(1).hp, before - 10, "10 HP per second in the hazard");
    let bp = w.rprv(1).backpack;
    for _ in 0..4 {
        tick(&mut w, 0, HAZARD_MAX_SLOTS_PER_TICK);
    }
    let dead = w.rpub(1);
    assert!(!dead.alive && dead.pending_drop && dead.exposed, "hazard death pending drop");
    let k = w.keeper.insecure_clone();
    let drop = ix(
        instruction::DropBackpack { slot: 1 },
        accounts::DropBackpack { raid: raid_pda(), rpub: slot_pda(RPUB_SEED, 1), rprv: slot_pda(RPRV_SEED, 1), drop_crate: crate_pda(DROP_CRATE_BASE + 1) },
    );
    w.send(TransactionTarget::Ephemeral, &[&k], &[drop.clone()], "drop_backpack");
    assert!(!w.rpub(1).pending_drop);
    assert_eq!(w.crate_acc(DROP_CRATE_BASE + 1).units, bp, "backpack moved to the drop crate");
    w.warp_er(1);
    w.send(TransactionTarget::Ephemeral, &[&k], &[drop], "drop_backpack twice is a no-op");
    assert_eq!(w.crate_acc(DROP_CRATE_BASE + 1).units, bp, "idempotent");
}

// Regression (devnet M3): the first tick lands seconds after start_raid. The start price must
// still be 100.0000, and the current price must be the slice at the current step.
#[test]
fn m3_late_first_tick_keeps_start_at_step0() {
    let mut w = verified_live_world();
    tick(&mut w, 4, TICK_SLOTS);
    let slice = designed_slice();
    for i in 0..3u8 {
        let d = district(&w, i);
        assert_eq!(d.start_price, PRICE_ONE, "district {i} start");
        assert_eq!(d.current_price, slice[4 * 3 + i as usize] as u64, "district {i} at step 4");
    }
    assert_eq!(w.raid().market_step, 4);
}

// ---------------- trades with exposure ----------------
#[test]
fn m3_trade_at_terminal_with_exposure() {
    let mut w = verified_live_world();
    tick(&mut w, 0, TICK_SLOTS);
    for _ in 0..10 {
        tick(&mut w, 1, TICK_SLOTS);
    }
    // Get loot: nearest active crate.
    let me = w.rprv(0);
    let (idx, c) = (0..NUM_CRATES as u8)
        .map(|i| (i, w.crate_acc(i)))
        .filter(|(_, c)| !c.dormant)
        .min_by_key(|(_, c)| razkyn::util::dist2(me.x, me.y, c.x, c.y))
        .unwrap();
    w.walk_to(0, c.x, c.y, 50);
    w.try_open(0, idx).unwrap();
    w.warp_er(OPEN_CHANNEL_SLOTS);
    w.try_finish(0, idx).unwrap();
    let from = c.district;
    let units = c.units[from as usize];
    let to = (from + 1) % 3;

    let trade = |w: &World, f: u8, t: u8, u: u64| {
        ix(
            instruction::StartTrade { slot: 0, from_asset: f, to_asset: t, units: u },
            accounts::StartTrade {
                raid: raid_pda(), rprv: slot_pda(RPRV_SEED, 0), rpub: slot_pda(RPUB_SEED, 0),
                // v2: the district the trader stands in (halt checks)
                district: slot_pda(DISTRICT_SEED, w.read::<RaiderPrivate>(TransactionTarget::Ephemeral, slot_pda(RPRV_SEED, 0)).map(|p| razkyn::util::district_of(p.x).unwrap_or(0) as u8).unwrap_or(0)),
                raid_key: kp(&w.raiders[0].raid_key),
            },
        )
    };
    let finish = |w: &World| {
        let d = |i: u8| slot_pda(DISTRICT_SEED, i);
        ix(
            instruction::FinishTrade { slot: 0 },
            accounts::FinishTrade {
                raid: raid_pda(), rprv: slot_pda(RPRV_SEED, 0), rpub: slot_pda(RPUB_SEED, 0),
                district0: d(0), district1: d(1), district2: d(2), raid_key: kp(&w.raiders[0].raid_key),
            },
        )
    };
    let rk = w.rk(0);
    use TransactionTarget::Ephemeral;
    expect_err(w.try_send(Ephemeral, &[&rk], &[trade(&w, from, to, units)]), E_NOT_AT_TERMINAL, "trade away from a terminal");

    // Walk to the nearest terminal.
    let me = w.rprv(0);
    let (tx, ty) = TERMINALS_TILES.iter().map(|(x, y)| (x * 100 + 50, y * 100 + 50))
        .min_by_key(|(x, y)| razkyn::util::dist2(me.x, me.y, *x, *y)).unwrap();
    w.walk_to(0, tx, ty, 50);
    expect_err(w.try_send(Ephemeral, &[&rk], &[trade(&w, from, to, units + 1)]), E_INSUFFICIENT_UNITS, "more units than held");
    w.send(Ephemeral, &[&rk], &[trade(&w, from, to, units)], "start_trade");
    let exposed = w.rpub(0);
    let here = w.rprv(0);
    assert!(exposed.exposed && (exposed.pub_x, exposed.pub_y) == (here.x, here.y), "position public while trading");
    w.warp_er(TICK_SLOTS);
    expect_err(w.try_move(0, 1, 0), E_TRADING, "cannot move while trading");
    expect_err(w.try_send(Ephemeral, &[&rk], &[finish(&w)]), E_CHANNEL_NOT_DONE, "finish before 3 s");
    w.warp_er(TRADE_CHANNEL_SLOTS);
    w.send(Ephemeral, &[&rk], &[finish(&w)], "finish_trade");
    let prices: Vec<u64> = (0..3).map(|i| district(&w, i).current_price).collect();
    let expected = (units as u128 * prices[from as usize] as u128 / prices[to as usize] as u128) as u64;
    let bp = w.rprv(0).backpack;
    assert_eq!(bp[from as usize], 0);
    assert_eq!(bp[to as usize], expected, "swap at current prices, no spread");
    assert!(!w.rpub(0).exposed, "exposure ends after the trade");

    // Cancel path: start another trade, cancel it → no swap, exposure ends, can move again.
    w.send(Ephemeral, &[&rk], &[trade(&w, to, from, 1)], "start_trade 2");
    assert!(w.rpub(0).exposed);
    let cancel = ix(
        instruction::CancelTrade { slot: 0 },
        accounts::CancelTrade { raid: raid_pda(), rprv: slot_pda(RPRV_SEED, 0), rpub: slot_pda(RPUB_SEED, 0), raid_key: kp(&rk) },
    );
    w.send(Ephemeral, &[&rk], &[cancel], "cancel_trade");
    assert!(!w.rpub(0).exposed);
    assert_eq!(w.rprv(0).backpack, bp, "no swap on cancel");
    w.warp_er(TICK_SLOTS);
    w.try_move(0, 1, 0).expect("can move after cancel");
}

// ---------------- Live mode without valid feeds ----------------
#[test]
fn m3_live_mode_holds_price_without_valid_feed() {
    let mut w = live_raid(2);
    // A wrong account as feed (not owned by the oracle) is ignored; no feeds at all also works.
    let mut t = w.tick_ixs();
    // feed0 slot in Tick accounts: replace the program-id placeholder with the raid account.
    let feed0_pos = 5;
    t[0].accounts[feed0_pos].pubkey = a(raid_pda());
    let k = w.keeper.insecure_clone();
    w.warp_er(TICK_SLOTS);
    w.send(TransactionTarget::Ephemeral, &[&k], &t, "tick with a bogus feed");
    let d = district(&w, 0);
    assert_eq!((d.hist_len, d.current_price), (0, 0), "no price from an invalid feed");
    assert_eq!(w.raid().tick_no, 1, "tick still advances");
}
