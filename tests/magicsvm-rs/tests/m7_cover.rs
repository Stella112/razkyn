//! Cover (DECISIONS #42): cover tiles block movement and line of sight; crates never land on cover;
//! the layout keeps spawns, exits, terminals and the BOT safe rows / corridors clear.
mod common;
use common::*;
use razkyn::util::{line_clear, pos_blocked, tile_blocked};

const C: fn(u16) -> u16 = |t| t * UNITS_PER_TILE + UNITS_PER_TILE / 2;

#[test]
fn layout_keeps_key_places_clear() {
    for x in 0..MAP_W_TILES {
        for y in 0..MAP_H_TILES {
            if !tile_blocked(x, y) { continue; }
            assert!(x >= 2 && x <= MAP_W_TILES - 3 && y >= 2 && y <= MAP_H_TILES - 3, "edge clear ({x},{y})");
            assert!(!(8..=11).contains(&y) && !(28..=31).contains(&y), "BOT safe rows clear ({x},{y})");
            assert!(!(20..=23).contains(&x) && !(42..=45).contains(&x), "corridors clear ({x},{y})");
            for &(ex, ey) in EXIT_POINTS_TILES.iter() { assert!(x.abs_diff(ex) > 3 || y.abs_diff(ey) > 3, "exit clear ({x},{y})"); }
            for &(tx, ty) in TERMINALS_TILES.iter() { assert!(x.abs_diff(tx) > 2 || y.abs_diff(ty) > 2, "terminal clear ({x},{y})"); }
        }
    }
}

#[test]
fn crates_never_on_cover() {
    for s in 0..3000u32 {
        let mut seed = [0u8; 32];
        seed[..4].copy_from_slice(&s.to_le_bytes());
        for idx in 0..NUM_CRATES as u8 {
            let (x, y) = razkyn::instructions::crate_position(&seed, idx);
            assert!(!pos_blocked(x, y), "seed {s} crate {idx} on cover");
            let d = idx as usize / CRATES_PER_DISTRICT;
            let (lo, hi) = DISTRICT_X_TILES[d];
            assert!(x / UNITS_PER_TILE > lo && x / UNITS_PER_TILE < hi && (2..=37).contains(&(y / UNITS_PER_TILE)), "crate stays in its district");
        }
    }
}

#[test]
fn line_of_sight_math() {
    // Tower wall: tiles x 9-10, y 16-20.
    assert!(!line_clear(C(8), C(18), C(11), C(18)), "through the wall");
    assert!(line_clear(C(8), C(14), C(11), C(14)), "above the wall");
    assert!(!line_clear(C(5), C(15), C(13), C(21)), "diagonal through the wall");
    assert!(line_clear(C(8), C(18), C(8), C(25)), "alongside the wall");
}

#[test]
fn cover_blocks_moves_and_shots() {
    let mut w = live_raid(2);
    // Raider 0 west of the Tower wall, raider 1 east of it, both on row 18.
    w.walk_to(0, C(8), C(18), 10);
    w.walk_to(1, C(11), C(18), 10);
    let (a, b) = (w.rprv(0), w.rprv(1));
    assert!(pos_blocked(a.x + 100, a.y), "raider 0 stands next to the wall");
    // Stepping into the wall is refused, and the position does not change.
    w.warp_er(TICK_SLOTS);
    expect_err(w.try_move(0, 59, 0), E_BLOCKED, "move into cover");
    assert_eq!((w.rprv(0).x, w.rprv(0).y), (a.x, a.y));
    // A shot through the wall is refused (in range: 3 tiles).
    w.warp_er(100);
    expect_err(w.try_shoot(0, 1), E_NO_LOS, "shot through cover");
    assert_eq!(w.rpub(1).hp, 100);
    // Both step up to row 14 (clear line): the shot lands.
    w.walk_to(0, C(8), C(14), 10);
    w.walk_to(1, C(11), C(14), 10);
    assert!(line_clear(w.rprv(0).x, w.rprv(0).y, w.rprv(1).x, w.rprv(1).y) && b.x > 0);
    w.warp_er(100);
    w.try_shoot(0, 1).unwrap_or_else(|e| panic!("clear shot: {e:?}"));
    assert_eq!(w.rpub(1).hp, 100 - SHOT_DAMAGE);
}
