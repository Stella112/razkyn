// v2 rules (DECISIONS #35): combat interrupts trades, raider classes, VRF-planned market events
// (TRADING HALT) committed by hash.
mod common;
use common::*;
use razkyn::util::{derive_u64, district_of};

fn trade_ix(w: &mut World, slot: u8, from: u8, to: u8, units: u64) -> Instruction {
    let x = w.rprv(slot).x;
    ix(
        instruction::StartTrade { slot, from_asset: from, to_asset: to, units },
        accounts::StartTrade {
            raid: raid_pda(), rprv: slot_pda(RPRV_SEED, slot), rpub: slot_pda(RPUB_SEED, slot),
            district: slot_pda(DISTRICT_SEED, district_of(x).unwrap_or(0) as u8), raid_key: kp(&w.raiders[slot as usize].raid_key),
        },
    )
}
fn finish_ix(w: &World, slot: u8) -> Instruction {
    let d = |i: u8| slot_pda(DISTRICT_SEED, i);
    ix(
        instruction::FinishTrade { slot },
        accounts::FinishTrade {
            raid: raid_pda(), rprv: slot_pda(RPRV_SEED, slot), rpub: slot_pda(RPUB_SEED, slot),
            district0: d(0), district1: d(1), district2: d(2), raid_key: kp(&w.raiders[slot as usize].raid_key),
        },
    )
}
/// Open the nearest active crate for `slot`; returns (asset, units) now in the backpack.
fn loot(w: &mut World, slot: u8) -> (u8, u64) {
    let me = w.rprv(slot);
    let (idx, c) = (0..NUM_CRATES as u8)
        .map(|i| (i, w.crate_acc(i)))
        .filter(|(_, c)| !c.dormant)
        .min_by_key(|(_, c)| razkyn::util::dist2(me.x, me.y, c.x, c.y))
        .unwrap();
    w.walk_to(slot, c.x, c.y, 50);
    w.try_open(slot, idx).unwrap();
    w.warp_er(OPEN_CHANNEL_SLOTS);
    w.try_finish(slot, idx).unwrap();
    let bp = w.rprv(slot).backpack;
    let a = (0..3).max_by_key(|&i| bp[i]).unwrap() as u8;
    (a, bp[a as usize])
}
fn terminal(i: usize) -> (u16, u16) {
    let (x, y) = TERMINALS_TILES[i];
    (x * UNITS_PER_TILE + UNITS_PER_TILE / 2, y * UNITS_PER_TILE + UNITS_PER_TILE / 2)
}
/// Walk `slot` to the nearest terminal (or to terminal `only` if given).
fn to_terminal(w: &mut World, slot: u8, only: Option<usize>) -> usize {
    let me = w.rprv(slot);
    let i = only.unwrap_or_else(|| (0..TERMINALS_TILES.len()).min_by_key(|&i| { let t = terminal(i); razkyn::util::dist2(me.x, me.y, t.0, t.1) }).unwrap());
    let t = terminal(i);
    w.walk_to(slot, t.0, t.1, 40);
    i
}
fn tick(w: &mut World) {
    w.warp_er(TICK_SLOTS);
    let k = w.rk(0);
    let ixs = w.tick_ixs();
    w.send(TransactionTarget::Ephemeral, &[&k], &ixs, "tick");
}

#[test]
fn v2_combat_interrupts_trade() {
    let mut w = live_raid(2);
    let (from, units) = loot(&mut w, 0);
    to_terminal(&mut w, 0, None);
    let rk0 = w.rk(0);
    let t = trade_ix(&mut w, 0, from, (from + 1) % 3, units);
    w.send(TransactionTarget::Ephemeral, &[&rk0], &[t], "start_trade");
    assert_eq!(w.rprv(0).channel_kind, CH_TRADE);
    assert!(w.rpub(0).exposed, "position public while trading");
    // Raider 1 closes in and shoots: the hit cancels the trade before it commits.
    let me = w.rprv(0);
    w.walk_to(1, me.x, me.y, 300);
    w.warp_er(SHOT_COOLDOWN_SLOTS);
    w.try_shoot(1, 0).unwrap();
    assert_eq!(w.rprv(0).channel_kind, CH_NONE, "trade cancelled by the hit");
    assert!(!w.rpub(0).exposed, "no longer exposed");
    assert_eq!(w.rpub(0).hp, MAX_HP - SHOT_DAMAGE);
    w.warp_er(TRADE_CHANNEL_SLOTS);
    let f = finish_ix(&w, 0);
    expect_err(w.try_send(TransactionTarget::Ephemeral, &[&rk0], &[f]), E_NO_CHANNEL, "finish after interruption");
    assert_eq!(w.rprv(0).backpack[from as usize], units, "nothing swapped");
}

#[test]
fn v2_trader_class_trades_in_two_seconds() {
    CLASSES.with(|c| *c.borrow_mut() = vec![CLASS_TRADER, CLASS_RAIDER]);
    let mut w = live_raid(2);
    CLASSES.with(|c| c.borrow_mut().clear());
    assert_eq!(w.raid().classes[0], CLASS_TRADER);
    let (from, units) = loot(&mut w, 0);
    to_terminal(&mut w, 0, None);
    let rk = w.rk(0);
    let t = trade_ix(&mut w, 0, from, (from + 1) % 3, units);
    w.send(TransactionTarget::Ephemeral, &[&rk], &[t], "start_trade");
    w.warp_er(TRADER_TRADE_SLOTS - 20);
    let f = finish_ix(&w, 0);
    expect_err(w.try_send(TransactionTarget::Ephemeral, &[&rk], &[f]), E_CHANNEL_NOT_DONE, "trader before 2 s");
    // After 2 s the channel check passes. (MagicSVM has no price oracle, so a Live raid has no
    // prices and the swap itself stops at BadFeed: past the timing check. A normal raider still
    // gets ChannelNotDone here; full 3 s trades are covered in m3_trade_at_terminal_with_exposure.)
    w.warp_er(25);
    let f = finish_ix(&w, 0);
    expect_err(w.try_send(TransactionTarget::Ephemeral, &[&rk], &[f]), E_BAD_FEED, "trader past the 2 s channel (BadFeed, not ChannelNotDone)");
    let _ = units;
}

#[test]
fn v2_scout_sees_ten_tiles() {
    CLASSES.with(|c| *c.borrow_mut() = vec![CLASS_SCOUT, CLASS_RAIDER]);
    let mut w = live_raid(2);
    CLASSES.with(|c| c.borrow_mut().clear());
    // Put the raiders 9 tiles apart (inside a Scout's 10, outside the normal 8).
    let me = w.rprv(0);
    let tx = if me.x as u32 + 900 < (MAP_W_TILES * UNITS_PER_TILE) as u32 { me.x + 900 } else { me.x - 900 };
    w.walk_to(1, tx, me.y, 15);
    let other = w.rprv(1);
    let tiles = (razkyn::util::dist2(me.x, me.y, other.x, other.y) as f64).sqrt() / 100.0;
    assert!((8.3..=9.7).contains(&tiles), "about 9 tiles apart, got {tiles}");
    tick(&mut w);
    let k0 = a(kp(&w.raiders[0].raid_key));
    let k1 = a(kp(&w.raiders[1].raid_key));
    let v0: View = w.read_as(Some(k0), slot_pda(VIEW_SEED, 0)).unwrap();
    let v1: View = w.read_as(Some(k1), slot_pda(VIEW_SEED, 1)).unwrap();
    assert_eq!(v0.count, 1, "the Scout sees raider 2 at ~9 tiles");
    assert_eq!(v1.count, 0, "a normal raider does not see the Scout at ~9 tiles");
}

/// The program's event plan for a seed (tee_setup.rs vrf_callback_raid).
fn plan(seed: &[u8; 32]) -> [u8; 8] {
    let first = (derive_u64(seed, b"evk", 0) % 3) as u8 + 1;
    let second = (first + (derive_u64(seed, b"evk", 1) % 2) as u8) % 3 + 1;
    let mut e = [0u8; 8];
    for (i, kind) in [first, second].into_iter().enumerate() {
        e[4 * i] = kind;
        e[4 * i + 1] = (derive_u64(seed, b"evd", i as u32) % 3) as u8;
        let at = (EVENT_MIN_AT + derive_u64(seed, b"evt", i as u32) % EVENT_AT_SPAN) as u16;
        e[4 * i + 2..4 * i + 4].copy_from_slice(&at.to_le_bytes());
    }
    e
}

#[test]
fn v2_market_events_committed_and_trading_halt() {
    // A seed whose first event is a TRADING HALT.
    let seed = (1u8..=255).map(|b| [b; 32]).find(|s| plan(s)[0] == EVENT_TRADING_HALT).expect("seed");
    let p = plan(&seed);
    let (district, at) = (p[1], u16::from_le_bytes([p[2], p[3]]) as i64);
    let mut w = live_raid_seeded(2, Some(seed));
    // The plan is committed by hash before the raid starts.
    let h = solana_sha256_hasher::hashv(&[b"razkyn-events".as_ref(), p.as_ref()]).to_bytes();
    assert_eq!(w.raid().event_plan_hash, h, "event plan committed by hash");
    assert_eq!(w.raid().event_kind, EVENT_NONE);
    // Loot, then stand at a terminal in the district the halt will hit.
    let (from, units) = loot(&mut w, 0);
    let term = (0..TERMINALS_TILES.len()).find(|&i| district_of(terminal(i).0) == Some(district as usize)).unwrap();
    to_terminal(&mut w, 0, Some(term));
    // The halt fires at its planned second.
    w.advance_secs(at + 1);
    tick(&mut w);
    let r = w.raid();
    assert_eq!((r.event_kind, r.event_district, r.events_fired & 1), (EVENT_TRADING_HALT, district, 1), "halt fired");
    let rk = w.rk(0);
    let t = trade_ix(&mut w, 0, from, (from + 1) % 3, units);
    expect_err(w.try_send(TransactionTarget::Ephemeral, &[&rk], &[t]), E_TRADING_HALTED, "terminal closed during the halt");
    // 30 s later the halt ends and the terminal works again.
    w.advance_secs(EVENT_SECS + 1);
    tick(&mut w);
    assert_ne!(w.raid().event_kind, EVENT_TRADING_HALT, "halt over");
    let t = trade_ix(&mut w, 0, from, (from + 1) % 3, units);
    w.send(TransactionTarget::Ephemeral, &[&rk], &[t], "trade after the halt");
}
